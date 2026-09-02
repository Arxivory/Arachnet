export class Grid {
  constructor(opts = {}) {
    this.size = opts.gridSize || 32;
    this.color = opts.gridColor || '#818181ff';
    this.majorColor = opts.gridMajorColor || '#6b6b6bff';
    this.minorAlpha = opts.gridMinorAlpha || 0.12;
    this.snap = opts.snap ?? true;
    this.snapTolerance = opts.snapTolerance || 8;
  }

  snapToGrid(pt) {
    if (!this.snap) return pt;
    const gx = Math.round(pt.x / this.size) * this.size;
    const gy = Math.round(pt.y / this.size) * this.size;
    return { x: gx, y: gy };
  }

  renderMinorGrids(ctx, width, height) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = this.minorAlpha;
    ctx.lineWidth = 1;
    
    for (let x = 0; x <= width; x += this.size) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = 0; y <= height; y += this.size) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  renderMajorGrids(ctx, width, height) {
    ctx.save();
    ctx.beginPath();
    ctx.strokeStyle = this.majorColor;
    ctx.lineWidth = 1;
    
    for (let x = 0; x <= width; x += this.size * 4) {
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, height);
    }
    for (let y = 0; y <= height; y += this.size * 4) {
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(width, y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
  }

  setSize(size) {
    this.size = size;
  }

  setSnap(enabled) {
    this.snap = !!enabled;
  }

  getSnapTolerance() {
    return this.snapTolerance;
  }
}

export default Grid;
