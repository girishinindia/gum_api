export class RazorpayService {
  async createOrder(_input: { amount: number; receipt: string }) {
    throw new Error('Razorpay integration is scaffolded but not wired yet.');
  }
}

export const razorpayService = new RazorpayService();
