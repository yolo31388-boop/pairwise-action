const HITSTUN_DURATION = 0.3;

let nextEnemyId = 1;

class Enemy {
  constructor(x, y) {
    this.id = nextEnemyId++;
    this.x = x; this.y = y;
    this.width = 32; this.height = 48;
    this.health = 10;
    this.dead = false;
    this.hitstun = 0;
    this.vx = 0; this.vy = 0;
    this.onGround = true;
    this.solid = true;
    this.world = null;
  }
  get feetY() { return this.y + this.height; }
  takeDamage(dmg) {
    if (this.dead) return;
    this.health -= dmg;
    this.hitstun = HITSTUN_DURATION; // 受伤硬直，连续攻击会刷新
    if (this.health <= 0) {
      this.health = 0;
      this.die();
    }
  }
  die() {
    if (this.dead) return;
    this.dead = true;
    this.solid = false; // 不再阻挡玩家
    if (this.world) this.world.removeEnemy(this); // 从碰撞系统移除
  }
  update(dt) {
    if (this.hitstun > 0) this.hitstun = Math.max(0, this.hitstun - dt);
  }
}

module.exports = { Enemy, HITSTUN_DURATION };
