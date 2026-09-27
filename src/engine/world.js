class World {
  constructor() {
    this.platforms = [];
    this.enemies = []; // 碰撞注册表
  }
  addPlatform(x, y, width, height) {
    this.platforms.push({ x, y, width, height });
    return this;
  }
  addEnemy(enemy) {
    if (!this.enemies.includes(enemy)) this.enemies.push(enemy);
    enemy.world = this;
    return this;
  }
  removeEnemy(enemy) {
    const i = this.enemies.indexOf(enemy);
    if (i >= 0) this.enemies.splice(i, 1);
    if (enemy.world === this) enemy.world = null;
    return this;
  }
  groundYAt(x) {
    let best = null;
    for (const p of this.platforms) {
      if (x >= p.x && x <= p.x + p.width) best = best === null ? p.y : Math.min(best, p.y);
    }
    return best;
  }
  hasGroundAt(x, feetY, tolerance = 16) {
    for (const p of this.platforms) {
      if (x >= p.x && x <= p.x + p.width && Math.abs(p.y - feetY) <= tolerance) return true;
    }
    return false;
  }
  static defaultFor(enemy) {
    const w = new World();
    w.addPlatform(-200, enemy.y + enemy.height, 400, 20);
    return w;
  }
}

module.exports = { World };
