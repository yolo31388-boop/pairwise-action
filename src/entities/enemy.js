const HITSTUN_DURATION = 0.35;

class Enemy {
  constructor(x, y) {
    this.x = x;
    this.y = y;
    this.width = 32;
    this.height = 48;
    this.health = 10;
    this.dead = false;
    this.solid = true; // 死亡后置 false，从碰撞系统移除
    this.hitstun = 0;
    this.vx = 0;
    this.vy = 0;
    this.jumping = false;
    this.jumpStartY = y;
    this.onDamaged = null;
    this.onDeath = null;
  }

  takeDamage(dmg) {
    if (this.dead) return;
    this.health -= dmg;
    // 受伤硬直：连续攻击会刷新硬直时间
    this.hitstun = HITSTUN_DURATION;
    if (this.health <= 0) {
      this.health = 0;
      this.dead = true;
      this.solid = false; // 从碰撞系统移除，不再阻挡玩家
      this.vx = 0;
      this.vy = 0;
      this.jumping = false;
      if (this.onDeath) this.onDeath();
    } else if (this.onDamaged) {
      this.onDamaged();
    }
  }
}

module.exports = { Enemy, HITSTUN_DURATION };
