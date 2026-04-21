import { Request, Response } from 'express';
import { listBunnyStorage } from '../../config/bunny';
import { deleteBunnyFolder } from '../../services/storage.service';
import { logAdmin } from '../../services/activityLog.service';
import { getClientIp } from '../../utils/helpers';
import { ok, err } from '../../utils/response';

interface TreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  lastChanged: string;
  children?: TreeNode[];
}

/**
 * GET /material-tree?path=materials
 * Lists files/folders in Bunny storage at the given path.
 * If ?recursive=true, fetches the full tree (up to 3 levels deep from materials/).
 */
export async function list(req: Request, res: Response) {
  const dirPath = (req.query.path as string) || 'materials';
  try {
    const items = await listBunnyStorage(dirPath);
    const nodes: TreeNode[] = items
      .filter((f: any) => f.ObjectName !== '.folder')
      .map((f: any) => ({
        name: f.ObjectName,
        path: `${dirPath}/${f.ObjectName}`.replace(/\/+/g, '/'),
        isDirectory: f.IsDirectory,
        size: f.Length || 0,
        lastChanged: f.LastChanged || '',
      }))
      .sort((a: TreeNode, b: TreeNode) => {
        // Directories first, then alphabetical
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return ok(res, nodes);
  } catch (e: any) {
    return err(res, e.message || 'Failed to list Bunny storage', 500);
  }
}

/**
 * GET /material-tree/full
 * Recursively fetches the full materials tree (subjects > chapters > topics > files).
 * Limited to 4 levels deep to avoid excessive API calls.
 */
export async function fullTree(req: Request, res: Response) {
  const basePath = 'materials';
  const maxDepth = 4;

  async function buildTree(path: string, depth: number): Promise<TreeNode[]> {
    if (depth > maxDepth) return [];
    try {
      const items = await listBunnyStorage(path);
      const nodes: TreeNode[] = [];

      for (const f of items) {
        if (f.ObjectName === '.folder') continue;
        const node: TreeNode = {
          name: f.ObjectName,
          path: `${path}/${f.ObjectName}`.replace(/\/+/g, '/'),
          isDirectory: f.IsDirectory,
          size: f.Length || 0,
          lastChanged: f.LastChanged || '',
        };
        if (f.IsDirectory) {
          node.children = await buildTree(node.path, depth + 1);
        }
        nodes.push(node);
      }

      return nodes.sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch {
      return [];
    }
  }

  try {
    const tree = await buildTree(basePath, 0);
    // Compute stats
    let totalFolders = 0, totalFiles = 0, totalSize = 0;
    function countNodes(nodes: TreeNode[]) {
      for (const n of nodes) {
        if (n.isDirectory) { totalFolders++; if (n.children) countNodes(n.children); }
        else { totalFiles++; totalSize += n.size; }
      }
    }
    countNodes(tree);

    return ok(res, { tree, stats: { totalFolders, totalFiles, totalSize } });
  } catch (e: any) {
    return err(res, e.message || 'Failed to build material tree', 500);
  }
}

/**
 * DELETE /material-tree/folder
 * Deletes a folder (and all its contents) from Bunny storage.
 * Body: { path: "materials/css3" }
 */
export async function deleteFolder(req: Request, res: Response) {
  const { path: folderPath } = req.body;
  if (!folderPath) return err(res, 'path is required', 400);

  // Safety: only allow deletion within materials/ folder
  const normalized = (folderPath as string).replace(/\/+$/, '');
  if (!normalized.startsWith('materials/')) {
    return err(res, 'Can only delete folders within materials/', 403);
  }

  try {
    await deleteBunnyFolder(normalized);

    logAdmin({
      actorId: req.user!.id,
      action: 'media_deleted',
      targetType: 'bunny_folder',
      targetId: 0,
      targetName: normalized,
      ip: getClientIp(req),
    });

    return ok(res, null, `Folder "${normalized}" deleted successfully`);
  } catch (e: any) {
    return err(res, e.message || 'Failed to delete folder', 500);
  }
}
