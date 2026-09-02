export class ShapeRenderer {
  constructor(opts = {}) {
    this.gridSize = opts.gridSize || 32;
    this.scaler = 0.7;
  }

  renderRectangles(ctx, rectangles) {
    for (const rect of rectangles) {
      rect.updatePath();
      ctx.fillStyle = 'rgba(174, 174, 174, 0.5)';
      ctx.fillRect(rect.x, rect.y, rect.transform.scale.w, rect.transform.scale.h);
      ctx.strokeStyle = '#000000ff';
      ctx.lineWidth = 4;
      ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.transform.scale.w, rect.transform.scale.h);
    }
  }

  renderCircles(ctx, circles) {
    ctx.strokeStyle = '#000000ff';
    ctx.lineWidth = 4;
    for (const circle of circles) {
      circle.updatePath();
      ctx.beginPath();
      ctx.fillStyle = 'rgba(174, 174, 174, 0.5)';
      ctx.arc(circle.x + 0.5, circle.y + 0.5, circle.transform.scale.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.closePath();
    }
  }

  renderPolygons(ctx, polygons) {
    ctx.strokeStyle = '#000000ff';
    ctx.fillStyle = 'rgba(150,150,150,0.4)';
    ctx.lineWidth = 4;
    for (const poly of polygons) {
      poly.updatePath();
      ctx.fill(poly.path);
      ctx.stroke(poly.path);
    }
  }

  renderFreeforms(ctx, freeforms) {
    ctx.strokeStyle = '#000000ff';
    ctx.fillStyle = 'rgba(150,150,150,0.4)';
    ctx.lineWidth = 4;
    for (const freeform of freeforms) {
      freeform.updatePath();
      ctx.fill(freeform.path);
      ctx.stroke(freeform.path);
    }
  }

  renderWalls(ctx, walls) {
    ctx.strokeStyle = '#000000ff';
    ctx.lineWidth = 4;
    for (const wall of walls) {
      wall.updatePath();
      ctx.stroke(wall.path);
    }
  }

  renderCables(ctx, cables) {
    ctx.strokeStyle = '#292929ff';
    ctx.lineWidth = 1.5;
    for (const cable of cables) {
      const s = typeof cable.transform?.scale === 'number' ? cable.transform.scale : (cable.transform?.scale?.x ?? 1);
      const x1 = cable.x1, y1 = cable.y1, x2 = cable.x2, y2 = cable.y2;
      const ax = (x1 + x2) / 2, ay = (y1 + y2) / 2;
      const sx1 = ax + (x1 - ax) * s, sy1 = ay + (y1 - ay) * s;
      const sx2 = ax + (x2 - ax) * s, sy2 = ay + (y2 - ay) * s;

      const path = new Path2D();
      path.moveTo(sx1 + 0.5, sy1 + 0.5);
      path.lineTo(sx2 + 0.5, sy2 + 0.5);

      cable.path = path;
      ctx.stroke(path);
    }
  }

  renderDevices(ctx, devices) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;

    for (const dev of devices) {
      const cx = dev.x + dev.renderWidth / 2;
      const cy = dev.y + dev.renderHeight / 2;
      const w = dev.renderWidth * this.scaler;
      const h = dev.renderHeight * this.scaler;
      const x = dev.x;
      const y = dev.y;

      dev.updatePath();

      // --- DRAW IMAGE ---
      if (dev.icon && dev.icon.complete && dev.icon.naturalWidth !== 0) {
        try {
          ctx.drawImage(dev.icon, x, y, w, h);
        } catch (e) {
          console.warn("Error drawing device icon:", e);
          this._drawFallbackDevice(ctx, x, y, w);
        }
      } else {
        this._drawFallbackDevice(ctx, x, y, w);
      }

      // --- AUTO-SCALING LABEL ---
      const labelText = dev.label || dev.hostname || dev.name || 'Device';
      const maxWidth = w * 1.5; // Max text width is 150% of the device icon width

      let fontSize = 12;
      ctx.font = `${fontSize}px sans-serif`;
      
      // Shrink font size dynamically until the text fits the max width (minimum 6px)
      while (ctx.measureText(labelText).width > maxWidth && fontSize > 6) {
          fontSize -= 0.5;
          ctx.font = `${fontSize}px sans-serif`;
      }

      ctx.fillStyle = '#000000';
      ctx.fillText(labelText, cx, cy + (h / 2) + 12);
    }

    ctx.restore();
  }


renderFurnitures(ctx, furnitures) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.lineWidth = 1;

    for (const dev of furnitures) {
      const s = dev.transform?.scale?.factor || dev.transform?.scale?.x || 1;
      const baseSize = this.gridSize * 1.5;
      const size = baseSize * s * this.scaler;
      const halfSize = size / 2;

      const x = dev.x - halfSize;
      const y = dev.y - halfSize;

      const path = new Path2D();
      path.rect(x, y, size, size);
      dev.path = path;

      // if (dev.icon && dev.icon.complete && dev.icon.naturalWidth !== 0) {
      //   try {
      //     ctx.drawImage(dev.icon, x, y, dev.renderWidth, dev.renderHeight);
      //   } catch (e) {
      //     console.warn("Error drawing furniture icon:", e);
      //     this._drawFallbackDevice(ctx, x, y, size);
      //   }

      // --- DRAW IMAGE --- 
      if (dev.icon && dev.icon.complete && dev.icon.naturalWidth !== 0) {
        try {
          // 🐛 THE FIX: Use 'size, size' instead of 'dev.renderWidth, dev.renderHeight'
          // Furniture objects don't use the renderWidth property!
          ctx.drawImage(dev.icon, x, y, size, size);
        } catch (e) {
          console.warn("Error drawing furniture icon:", e);
          this._drawFallbackDevice(ctx, x, y, size);
        }
      } else {
        this._drawFallbackDevice(ctx, x, y, size);
      }

      // --- AUTO-SCALING LABEL ---
      const labelText = dev.label || dev.name || 'Furniture';
      const maxWidth = size * 1.5; // Max text width is 150% of the furniture icon width

      let fontSize = 12 * this.scaler;
      ctx.font = `${fontSize}px sans-serif`;
      
      // Shrink font size dynamically until the text fits
      while (ctx.measureText(labelText).width > maxWidth && fontSize > 6) {
          fontSize -= 0.5;
          ctx.font = `${fontSize}px sans-serif`;
      }

      ctx.fillStyle = '#000000';
      ctx.fillText(labelText, dev.x, dev.y + halfSize + 14);
    }
    ctx.restore();
  }

  // Helper for drawing the box when no image is found
  _drawFallbackDevice(ctx, x, y, size) {
    ctx.fillStyle = 'rgba(255, 255, 255, 1)'; // White background
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = '#000000';
    ctx.strokeRect(x, y, size, size);
  }

  outlineRectangle(ctx, startPoint, currentPoint) {
    const x = Math.min(startPoint.x, currentPoint.x);
    const y = Math.min(startPoint.y, currentPoint.y);
    const width = Math.abs(currentPoint.x - startPoint.x);
    const height = Math.abs(currentPoint.y - startPoint.y);
    ctx.fillRect(x, y, width, height);
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  }

  outlineCircle(ctx, startPoint, currentPoint) {
    const cx = startPoint.x;
    const cy = startPoint.y;
    const dx = currentPoint.x - cx;
    const dy = currentPoint.y - cy;
    const r = Math.hypot(dx, dy);
    ctx.beginPath();
    ctx.arc(cx + 0.5, cy + 0.5, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  outlineWall(ctx, startPoint, currentPoint) {
    ctx.beginPath();
    ctx.moveTo(startPoint.x + 0.5, startPoint.y + 0.5);
    ctx.lineTo(currentPoint.x + 0.5, currentPoint.y + 0.5);
    ctx.stroke();
  }

  outlineCable(ctx, startPoint, currentPoint) {
    ctx.beginPath();
    ctx.moveTo(startPoint.x + 0.5, startPoint.y + 0.5);
    ctx.lineTo(currentPoint.x + 0.5, currentPoint.y + 0.5);
    ctx.stroke();
  }

  outlineDoor(ctx, startPoint, currentPoint) {
    ctx.beginPath();
    ctx.moveTo(startPoint.x + 0.5, startPoint.y + 0.5);
    ctx.lineTo(currentPoint.x + 0.5, currentPoint.y + 0.5);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#00ff00';
    ctx.stroke();
  }

  outlinePolygonOrFreeformInProgress(ctx, polygonPoints, currentPoint, snapTolerance) {
    if (polygonPoints.length > 0) {
      const pts = polygonPoints;

      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);

      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x, pts[i].y);
      }

      ctx.lineTo(currentPoint.x, currentPoint.y);
      ctx.stroke();

      const first = pts[0];
      const dist = Math.hypot(
        currentPoint.x - first.x,
        currentPoint.y - first.y
      );

      if (dist < snapTolerance * 1.5) {
        ctx.beginPath();
        ctx.arc(first.x, first.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,255,0,0.3)';
        ctx.fill();
      }
    }
  }
}

export default ShapeRenderer;
