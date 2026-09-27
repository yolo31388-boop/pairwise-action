const { StateMachine } = require('./stateMachine.js');
const { World } = require('../engine/world.js');

class EnemyController {
  constructor(enemy, world) {
    this.enemy = enemy;
    this.world = world || World.defaultFor(enemy);
    this.world.addEnemy(enemy);
    this.fsm = new StateMachine();
    this.patrolDir = 1;

    this.detectRange = 100;    // 发现玩家范围
    this.chaseDropRange = 300; // 放弃追击范围
    this.attackRange = 48;
    this.idleTimeout = 0.1;
    this.patrolSpeed = 30;
    this.chaseSpeed = 60;
    this.damage = 3;
    this.attackWindup = 0.25;  // 前摇
    this.attackRecovery = 0.3; // 后摇
    this.jumpRange = 140;      // 悬崖对面玩家在此距离内才跳跃
    this.jumpSpeed = 300;
    this.jumpVx = 120;
    this.gravity = 800;

    this.fsm.durations.attack = this.attackWindup + this.attackRecovery;

    this.fsm.onEnter('attack', () => { this.enemy.vx = 0; });
    this.fsm.onExit('attack', () => { this.enemy.vx = 0; });
    this.fsm.onEnter('hurt', () => { this.enemy.vx = 0; });
    this.fsm.onEnter('dead', () => { this.enemy.vx = 0; this.enemy.vy = 0; });
  }

  update(dt, player) {
    const e = this.enemy;
    this.fsm.update(dt);
    e.update(dt);
    if (e.dead) { this._tryChange('dead'); return; }
    this._decide(dt, player); // 每帧重新评估，不缓存决策
    this._applyPhysics(dt);
    this._separate();
  }

  _tryChange(state) {
    if (this.fsm.state !== state && this.fsm.canChangeTo(state)) this.fsm.changeState(state);
  }

  _decide(dt, player) {
    for (let i = 0; i < 4; i++) {
      const before = this.fsm.state;
      this._decideOnce(dt, player);
      if (this.fsm.state === before) break;
    }
  }

  _decideOnce(dt, player) {
    const e = this.enemy;
    const px = player ? player.x : Infinity;
    const absDist = Math.abs(px - e.x);

    if (e.hitstun > 0) { this._tryChange('hurt'); return; } // 硬直：不能移动或攻击

    switch (this.fsm.state) {
      case 'dead':
      case 'hurt':
        return;
      case 'attack':
        // 前摇结束瞬间结算伤害；前摇后摇期间不能移动
        if (this.fsm.stateTime >= this.attackWindup && !this.fsm.flags.dealtDamage) {
          this.fsm.setFlag('dealtDamage', true);
          this._dealDamage(player);
        }
        return;
      case 'idle':
        if (absDist < this.detectRange) this._tryChange('chase');
        else if (this.fsm.stateTime >= this.idleTimeout) this._tryChange('patrol');
        return;
      case 'patrol':
        if (absDist < this.detectRange) { this._tryChange('chase'); return; }
        this._patrol(dt);
        return;
      case 'chase':
        if (absDist > this.chaseDropRange) { this._tryChange('patrol'); return; }
        if (absDist <= this.attackRange) { this._tryChange('attack'); return; }
        this._chase(dt, px);
        return;
    }
  }

  _hasGroundAhead(nextX, dir) {
    const e = this.enemy;
    const frontX = dir > 0 ? nextX + e.width : nextX;
    return this.world.hasGroundAt(frontX, e.feetY);
  }

  _patrol(dt) {
    const e = this.enemy;
    if (!e.onGround) return;
    const nextX = e.x + this.patrolDir * this.patrolSpeed * dt;
    if (!this._hasGroundAhead(nextX, this.patrolDir)) {
      this.patrolDir *= -1; // 平台边缘转身，不继续前进
      return;
    }
    e.x = nextX;
  }

  _chase(dt, px) {
    const e = this.enemy;
    if (!e.onGround) return;
    const dir = px > e.x ? 1 : -1;
    const nextX = e.x + dir * this.chaseSpeed * dt;
    if (this._hasGroundAhead(nextX, dir)) { e.x = nextX; return; }
    // 前方是悬崖：玩家在对面且距离可及时跳跃，否则停下，不能直接掉下去
    if (Math.abs(px - e.x) <= this.jumpRange) {
      e.vy = -this.jumpSpeed;
      e.vx = dir * this.jumpVx;
      e.onGround = false;
    }
  }

  _dealDamage(player) {
    if (!player) return;
    if (Math.abs(player.x - this.enemy.x) > this.attackRange) return;
    if (typeof player.takeDamage === 'function') player.takeDamage(this.damage);
    else if (typeof player.health === 'number') player.health -= this.damage;
  }

  _applyPhysics(dt) {
    const e = this.enemy;
    if (e.onGround) return;
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    e.vy += this.gravity * dt;
    const groundY = this.world.groundYAt(e.x + e.width / 2);
    if (groundY !== null && e.vy >= 0 && e.feetY >= groundY && e.feetY - groundY < 40) {
      e.y = groundY - e.height;
      e.vy = 0; e.vx = 0;
      e.onGround = true;
    }
  }

  _separate() {
    const e = this.enemy;
    if (!e.solid) return;
    for (const other of this.world.enemies) {
      if (other === e || other.dead || !other.solid) continue;
      const dx = other.x - e.x;
      const overlap = e.width - Math.abs(dx);
      if (overlap > 0 && Math.abs(other.y - e.y) < e.height) {
        const dir = dx > 0 ? -1 : dx < 0 ? 1 : (e.id < other.id ? -1 : 1);
        e.x += dir * (overlap / 2 + 0.5);
      }
    }
  }
}

module.exports = { EnemyController };
