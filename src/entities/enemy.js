
class Enemy {
  constructor(x, y) { this.x=x; this.y=y; this.width=32; this.height=48; this.health=10; this.dead=false; this.hitstun=0; }
  takeDamage(dmg) {
    this.health -= dmg;
    if (this.health <= 0) this.dead = true;
    // BUG: 没有硬直
  }
}

module.exports = { Enemy };
