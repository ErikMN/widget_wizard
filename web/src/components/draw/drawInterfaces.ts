/* Draw interfaces
 *
 * Brush strokes are stored in native video coordinates so the same data can be
 * re-rendered at any video size and exported without losing alignment.
 */
export type DrawTool = 'brush' | 'eraser';

export interface DrawPoint {
  x: number;
  y: number;
}

export interface DrawStroke {
  id: number;
  tool: DrawTool;
  color: string;
  size: number;
  points: DrawPoint[];
}
