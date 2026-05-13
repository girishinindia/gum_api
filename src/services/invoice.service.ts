/**
 * Invoice Service (Phase 8.4)
 * ───────────────────────────
 * Generates a GST-compliant PDF invoice for a paid order:
 *
 *   1. Resolve the invoice row + order + order_items + buyer billing state.
 *   2. Allocate a tax_invoice_no via fn_generate_tax_invoice_no.
 *   3. Calculate CGST+SGST (intra-state) OR IGST (inter-state) breakup.
 *   4. Render a branded HTML template → PDF buffer via pdf.service.
 *   5. Upload the PDF to Bunny CDN under /invoices/<tax_invoice_no>.pdf.
 *   6. UPDATE invoices SET pdf_url + tax_invoice_no + tax_invoice_issued_at.
 *
 * The function is idempotent: if invoices.tax_invoice_no is already set,
 * it returns the existing URL without regenerating.
 *
 * Called from:
 *   - orchestratePostPayment (Phase 8.7) via withStep('invoice_pdf', …)
 *   - The 'pdf-generation' queue worker (when QUEUE_ENABLED=true)
 *   - Admin manual regenerate endpoint (future)
 */

import { supabase } from '../config/supabase';
import { db } from './db';
import { config } from '../config';
import { uploadToBunny } from '../config/bunny';
import { htmlToPdfBuffer } from './pdf.service';
import { logger } from '../utils/logger';

// ── Supplier identity (GUM is in Gujarat, Surat — pin from config later) ──
const SUPPLIER = {
  name: 'Genius ITens',
  brand: 'Grow Up More',
  address1: 'Surat, Gujarat, India',
  gstin: process.env.SUPPLIER_GSTIN || '24XXXXXXXXXXX1ZX',
  stateCode: process.env.SUPPLIER_STATE_CODE || 'GJ',   // ISO 3166-2:IN code, used for tax classification
  email: 'info@growupmore.com',
  website: 'growupmore.com',
};

// Indian state codes — used to determine intra- vs inter-state for GST split.
// Mapping a buyer's billing_state text (e.g. 'Gujarat') to a 2-char code is
// done with a forgiving lookup; unknown states fall back to IGST.
const STATE_NAME_TO_CODE: Record<string, string> = {
  'andhra pradesh': 'AP', 'arunachal pradesh': 'AR', 'assam': 'AS', 'bihar': 'BR',
  'chhattisgarh': 'CG', 'goa': 'GA', 'gujarat': 'GJ', 'haryana': 'HR',
  'himachal pradesh': 'HP', 'jharkhand': 'JH', 'karnataka': 'KA', 'kerala': 'KL',
  'madhya pradesh': 'MP', 'maharashtra': 'MH', 'manipur': 'MN', 'meghalaya': 'ML',
  'mizoram': 'MZ', 'nagaland': 'NL', 'odisha': 'OD', 'punjab': 'PB',
  'rajasthan': 'RJ', 'sikkim': 'SK', 'tamil nadu': 'TN', 'telangana': 'TG',
  'tripura': 'TR', 'uttar pradesh': 'UP', 'uttarakhand': 'UK', 'west bengal': 'WB',
  'delhi': 'DL', 'jammu and kashmir': 'JK', 'ladakh': 'LA',
  'puducherry': 'PY', 'chandigarh': 'CH', 'dadra and nagar haveli and daman and diu': 'DH',
  'andaman and nicobar islands': 'AN', 'lakshadweep': 'LD',
};

function buyerStateCode(billingState: string | null): string | null {
  if (!billingState) return null;
  const key = String(billingState).trim().toLowerCase();
  return STATE_NAME_TO_CODE[key] ?? null;
}

interface InvoiceLine {
  description: string;
  hsn_sac: string;
  qty: number;
  rate: number;     // pre-discount price per unit
  discount: number;
  taxable: number;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatINR(n: number): string {
  return new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

function buildInvoiceHtml(args: {
  invoiceNo: string;
  issuedAt: Date;
  buyer: {
    name: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    country: string | null;
    pincode: string | null;
    gstin: string | null;
  };
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  taxableTotal: number;
  taxBreakup: {
    intraState: boolean;
    cgst: number;
    sgst: number;
    igst: number;
    total: number;
  };
  grandTotal: number;
  currency: string;
  paymentRef: string | null;
  notes?: string;
}): string {
  const { invoiceNo, issuedAt, buyer, lines, subtotal, discount, taxableTotal, taxBreakup, grandTotal, currency, paymentRef } = args;
  const issuedLabel = issuedAt.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });

  const lineRows = lines.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <div class="line-desc">${escapeHtml(l.description)}</div>
        <div class="line-hsn">HSN/SAC: ${escapeHtml(l.hsn_sac)}</div>
      </td>
      <td class="num">${l.qty}</td>
      <td class="num">${formatINR(l.rate)}</td>
      <td class="num">${formatINR(l.discount)}</td>
      <td class="num"><strong>${formatINR(l.taxable)}</strong></td>
    </tr>
  `).join('');

  const taxRow = taxBreakup.intraState
    ? `
      <tr><td>CGST @ 9%</td><td class="num">₹ ${formatINR(taxBreakup.cgst)}</td></tr>
      <tr><td>SGST @ 9%</td><td class="num">₹ ${formatINR(taxBreakup.sgst)}</td></tr>
    `
    : `
      <tr><td>IGST @ 18%</td><td class="num">₹ ${formatINR(taxBreakup.igst)}</td></tr>
    `;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(invoiceNo)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif; color: #0f172a; margin: 0; font-size: 13px; line-height: 1.5; }
  .wrap { padding: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding-bottom: 16px; border-bottom: 2px solid #0284c7; }
  .brand { font-size: 22px; font-weight: 700; color: #0284c7; letter-spacing: -0.4px; }
  .brand small { display:block; font-size: 11px; color:#64748b; font-weight:500; letter-spacing: 0; }
  .meta { text-align: right; font-size: 12px; color: #475569; }
  .meta .label { color: #94a3b8; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; }
  .meta .invno { font-size: 16px; font-weight: 700; color: #0f172a; margin-top:2px; }
  .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; padding: 16px 0; }
  .party h3 { font-size: 11px; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.6px; margin: 0 0 6px; }
  .party p { margin: 2px 0; font-size: 12.5px; color: #334155; }
  .party strong { color: #0f172a; }
  table.lines { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.lines th { background: #f1f5f9; color: #475569; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  table.lines td { padding: 10px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 12.5px; }
  table.lines td.num { text-align: right; }
  table.lines .line-desc { color: #0f172a; font-weight: 500; }
  table.lines .line-hsn { color: #94a3b8; font-size: 10.5px; margin-top: 2px; }
  .totals { width: 320px; margin-left: auto; margin-top: 16px; }
  .totals table { width: 100%; }
  .totals td { padding: 4px 0; font-size: 12.5px; color: #475569; }
  .totals td.num { text-align: right; }
  .totals tr.grand { border-top: 2px solid #0284c7; }
  .totals tr.grand td { font-size: 16px; font-weight: 700; color: #0f172a; padding-top: 8px; }
  .notes { margin-top: 24px; padding: 12px; background: #f8fafc; border-left: 3px solid #38bdf8; font-size: 11.5px; color: #475569; }
  footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #e2e8f0; font-size: 10.5px; color: #94a3b8; display: flex; justify-content: space-between; }
  .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #dcfce7; color: #166534; font-size: 10px; font-weight: 700; }
</style></head>
<body><div class="wrap">

  <header>
    <div>
      <div class="brand">${escapeHtml(SUPPLIER.brand)}<small>by ${escapeHtml(SUPPLIER.name)}</small></div>
      <p style="margin:6px 0 0;font-size:11px;color:#64748b;">${escapeHtml(SUPPLIER.address1)}</p>
      <p style="margin:2px 0 0;font-size:11px;color:#64748b;"><strong>GSTIN:</strong> ${escapeHtml(SUPPLIER.gstin)} &nbsp; · &nbsp; State: ${escapeHtml(SUPPLIER.stateCode)}</p>
    </div>
    <div class="meta">
      <div class="label">Tax Invoice</div>
      <div class="invno">${escapeHtml(invoiceNo)}</div>
      <div style="margin-top:4px;">Issued: ${escapeHtml(issuedLabel)}</div>
      <div class="pill" style="margin-top:8px;">PAID</div>
    </div>
  </header>

  <section class="parties">
    <div class="party">
      <h3>Bill To</h3>
      <p><strong>${escapeHtml(buyer.name || '—')}</strong></p>
      ${buyer.email ? `<p>${escapeHtml(buyer.email)}</p>` : ''}
      ${buyer.phone ? `<p>${escapeHtml(buyer.phone)}</p>` : ''}
      ${buyer.address ? `<p>${escapeHtml(buyer.address)}</p>` : ''}
      <p>${[buyer.city, buyer.state, buyer.pincode].filter(Boolean).map((v) => escapeHtml(String(v))).join(', ')}</p>
      ${buyer.country ? `<p>${escapeHtml(buyer.country)}</p>` : ''}
      ${buyer.gstin ? `<p style="margin-top:6px;"><strong>GSTIN:</strong> ${escapeHtml(buyer.gstin)}</p>` : ''}
    </div>
    <div class="party" style="text-align:right;">
      <h3>Place of supply</h3>
      <p><strong>${escapeHtml(buyer.state || '—')}</strong> ${taxBreakup.intraState ? '(Intra-state)' : '(Inter-state)'}</p>
      ${paymentRef ? `<p style="margin-top:8px;"><span style="color:#94a3b8;font-size:10.5px;text-transform:uppercase;letter-spacing:0.5px;">Payment ref</span><br><strong>${escapeHtml(paymentRef)}</strong></p>` : ''}
    </div>
  </section>

  <table class="lines">
    <thead><tr>
      <th style="width:32px;">#</th>
      <th>Description</th>
      <th class="num">Qty</th>
      <th class="num">Rate</th>
      <th class="num">Discount</th>
      <th class="num">Taxable</th>
    </tr></thead>
    <tbody>${lineRows}</tbody>
  </table>

  <div class="totals">
    <table>
      <tr><td>Subtotal</td><td class="num">₹ ${formatINR(subtotal)}</td></tr>
      ${discount > 0 ? `<tr><td>Discount</td><td class="num">− ₹ ${formatINR(discount)}</td></tr>` : ''}
      <tr><td>Taxable Amount</td><td class="num">₹ ${formatINR(taxableTotal)}</td></tr>
      ${taxRow}
      <tr class="grand"><td>Total (${escapeHtml(currency)})</td><td class="num">₹ ${formatINR(grandTotal)}</td></tr>
    </table>
  </div>

  ${args.notes ? `<div class="notes">${escapeHtml(args.notes)}</div>` : ''}

  <footer>
    <span>This is a computer-generated invoice; no signature required.</span>
    <span>${escapeHtml(SUPPLIER.website)} · ${escapeHtml(SUPPLIER.email)}</span>
  </footer>

</div></body></html>`;
}

// ── Public API ────────────────────────────────────────────────────

export interface GenerateInvoiceResult {
  invoiceId: number;
  taxInvoiceNo: string;
  pdfUrl: string;
  alreadyExisted: boolean;
}

/**
 * Generate the PDF for an order's invoice, upload to Bunny, and persist
 * the URL + assigned tax_invoice_no. Idempotent.
 */
export async function generateInvoiceForOrder(orderId: number): Promise<GenerateInvoiceResult> {
  // 1. Resolve invoice + order + items
  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('order_id', orderId)
    .is('deleted_at', null)
    .single();

  if (invErr || !invoice) {
    throw new Error(`Invoice not found for order #${orderId}`);
  }

  // Idempotency: if a PDF URL already exists, return it
  if (invoice.pdf_url && invoice.tax_invoice_no) {
    return {
      invoiceId: invoice.id,
      taxInvoiceNo: invoice.tax_invoice_no,
      pdfUrl: invoice.pdf_url,
      alreadyExisted: true,
    };
  }

  const { data: order, error: orderErr } = await supabase
    .from('orders').select('*').eq('id', orderId).single();
  if (orderErr || !order) throw new Error(`Order #${orderId} not found`);

  const { data: items } = await supabase
    .from('order_items').select('*').eq('order_id', orderId).is('deleted_at', null);

  // 2. Allocate tax_invoice_no via SQL function
  const numRows = await db.callFn('fn_generate_tax_invoice_no', { p_state_code: SUPPLIER.stateCode });
  const taxInvoiceNo = String(Array.isArray(numRows) ? numRows[0] : numRows);

  // 3. Compute tax breakup
  const subtotal = Number(invoice.subtotal || 0);
  const discount = Number(invoice.discount_amount || 0);
  const taxableTotal = Math.max(subtotal - discount, 0);

  const buyerCode = buyerStateCode(invoice.billing_state);
  const intraState = buyerCode !== null && buyerCode === SUPPLIER.stateCode;

  const totalTax = Number(invoice.tax_amount || 0) || Math.round(taxableTotal * 0.18 * 100) / 100;
  const cgst = intraState ? Math.round((totalTax / 2) * 100) / 100 : 0;
  const sgst = intraState ? Math.round((totalTax / 2) * 100) / 100 : 0;
  const igst = intraState ? 0 : totalTax;
  const grandTotal = Math.round((taxableTotal + totalTax) * 100) / 100;

  const lines: InvoiceLine[] = (items || []).map((it: any) => ({
    description: it.item_name || `${it.item_type} #${it.item_id}`,
    hsn_sac: '999293',  // education services HSN/SAC
    qty: 1,
    rate: Number(it.original_price || 0),
    discount: Number(it.discount_amount || 0),
    taxable: Math.max(Number(it.original_price || 0) - Number(it.discount_amount || 0), 0),
  }));

  const html = buildInvoiceHtml({
    invoiceNo: taxInvoiceNo,
    issuedAt: new Date(),
    buyer: {
      name: invoice.billing_name,
      email: invoice.billing_email,
      phone: invoice.billing_phone,
      address: invoice.billing_address,
      city: invoice.billing_city,
      state: invoice.billing_state,
      country: invoice.billing_country,
      pincode: invoice.billing_pincode,
      gstin: invoice.gst_number,
    },
    lines,
    subtotal,
    discount,
    taxableTotal,
    taxBreakup: { intraState, cgst, sgst, igst, total: totalTax },
    grandTotal,
    currency: invoice.currency || 'INR',
    paymentRef: order.razorpay_payment_id,
  });

  // 4. Render PDF
  const pdfBuf = await htmlToPdfBuffer(html, { format: 'A4' });

  // 5. Upload to Bunny under /invoices/<tax_invoice_no>.pdf
  const path = `invoices/${taxInvoiceNo}.pdf`;
  const cdnUrl = await uploadToBunny(path, pdfBuf);

  // 6. Persist + assign the tax_invoice_no atomically
  const { error: upErr } = await supabase
    .from('invoices')
    .update({
      pdf_url: cdnUrl,
      tax_invoice_no: taxInvoiceNo,
      tax_invoice_issued_at: new Date().toISOString(),
    })
    .eq('id', invoice.id);

  if (upErr) {
    logger.error({ err: upErr.message, invoiceId: invoice.id, orderId }, '[Invoice] DB update failed (PDF uploaded)');
    throw new Error(`Invoice update failed: ${upErr.message}`);
  }

  logger.info({ orderId, invoiceId: invoice.id, taxInvoiceNo, pdfUrl: cdnUrl }, '[Invoice] generated');

  return {
    invoiceId: invoice.id,
    taxInvoiceNo,
    pdfUrl: cdnUrl,
    alreadyExisted: false,
  };
}
