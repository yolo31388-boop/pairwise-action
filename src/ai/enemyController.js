const { StateMachine } = require('./stateMachine.js');

const PATROL_SPEED = 1;
const CHASE_SPEED = 2;
const CHASE_RANGE = 160;
const ATTACK_RANGE = 40;
const ATTACK_WINDUP = 0.25; // 前摇，期间可被打断
const ATTACK_RECOVER = 0.3; // 后摇，期间不能移动
const ATTACK_DAMAGE = 3;
const MAX_JUMP_DISTANCE = 100; // 超过该距离不跳，停在悬崖边
const JUMP_VY = -160;
const JUMP_VX = 60;
const GRAVITY = 400;

class EnemyController {
  constructor(enemy, options = {}) {
    this.enemy = enemy;
    this.fsm = new StateMachine();
    this.patrolDir = 1;
    this.chaseRange = options.chaseRange !== undefined ? options.chaseRange : CHASE_RANGE;
    this.attackRange = options.attackRange !== undefined ? options.attackRange : ATTACK_RANGE;
    this.maxJumpDistance =
      options.maxJumpDistance !== undefined ? options.maxJumpDistance : MAX_JUMP_DISTANCE;
    this.idleTimeout = options.idleTimeout !== undefined ? options.idleTimeout : 0;
    this.platforms = options.platforms || null;
    this.bounds = options.bounds || [-200, 200];
    this.attackWindup = ATTACK_WINDUP;
    this.attackDuration = ATTACK_WINDUP + ATTACK_RECOVER;
    this.attackDidHit = false;

    enemy.onDamaged = () => {
      if (this.fsm.state !== 'dead') {
        // 受伤可打断前摇；连续攻击时重入 hurt 刷新硬直
        this.fsm.changeState('hurt', { force: true, reenter: true });
      }
    };
    enemy.onDeath = () => {
      this.fsm.changeState('dead', { force: true });
    };
    this.fsm.on('attack', {
      onEnter: () => {
        this.attackDidHit = false;
      },
      onExit: () => {
        this.attackDidHit = false; // 退出时清理标志
      },
    });
  }

  hasGroundAt(x) {
    const footY = this.enemy.y + this.enemy.height;
    if (this.platforms) {
      return this.platforms.some(
        (p) =>
          x >= p.x &&
          x <= p.x + p.width &&
          (p.y === undefined || Math.abs(p.y - footY) <= 8)
      );
    }
    return x >= this.bounds[0] && x <= this.bounds[1];
  }

  // 检测从 fromX 向 dir 方向迈步后，脚下是否还有地面
  groundAhead(dir, fromX) {
    const x = fromX !== undefined ? fromX : this.enemy.x;
    const footX = dir > 0 ? x + this.enemy.width + 1 : x - 1;
    return this.hasGroundAt(footX);
  }

  update(dt, player, others = []) {
    const enemy = this.enemy;
    if (enemy.dead) return;
    this.fsm.update(dt);
    if (enemy.hitstun > 0) enemy.hitstun = Math.max(0, enemy.hitstun - dt);

    if (enemy.jumping) {
      enemy.vy += GRAVITY * dt;
      enemy.x += enemy.vx * dt;
      enemy.y += enemy.vy * dt;
      if (enemy.vy > 0 && enemy.y >= enemy.jumpStartY) {
        enemy.y = enemy.jumpStartY;
        enemy.vy = 0;
        enemy.vx = 0;
        enemy.jumping = false;
      }
      return;
    }

    if (this.fsm.state === 'attack') {
      // 前摇 + 后摇期间不能移动
      if (!this.attackDidHit && this.fsm.stateTime >= this.attackWindup) {
        this.attackDidHit = true;
        if (
          player &&
          Math.abs(player.x - enemy.x) <= this.attackRange &&
          typeof player.health === 'number'
        ) {
          player.health -= ATTACK_DAMAGE;
        }
      }
      if (this.fsm.stateTime >= this.attackDuration) this.fsm.changeState('idle');
      return;
    }
    if (this.fsm.state === 'hurt') {
      // 硬直期间不能攻击或移动
      if (enemy.hitstun <= 0) this.fsm.changeState('idle');
      return;
    }

    // AI 决策每帧重新评估，不缓存
    const distToPlayer = player ? Math.abs(player.x - enemy.x) : Infinity;
    if (distToPlayer <= this.attackRange) {
      this.fsm.changeState('attack');
      return;
    }
    if (distToPlayer <= this.chaseRange) {
      this.fsm.changeState('chase');
      this.chase(dt, player);
    } else {
      if (this.fsm.state === 'chase') this.fsm.changeState('idle');
      if (this.fsm.state === 'idle' && this.fsm.stateTime >= this.idleTimeout) {
        this.fsm.changeState('patrol');
      }
      if (this.fsm.state === 'patrol') this.patrol(dt);
    }
    this.applySeparation(others);
  }

  patrol(dt) {
    const enemy = this.enemy;
    const nextX = enemy.x + this.patrolDir * PATROL_SPEED * dt;
    if (!this.groundAhead(this.patrolDir, nextX)) {
      this.patrolDir *= -1; // 平台边缘必须转身，不能继续前进
      return;
    }
    enemy.x = nextX;
  }

  chase(dt, player) {
    const enemy = this.enemy;
    const dir = player.x > enemy.x ? 1 : -1;
    const nextX = enemy.x + dir * CHASE_SPEED * dt;
    if (this.groundAhead(dir, nextX)) {
      enemy.x = nextX;
      return;
    }
    // 前方是悬崖：根据距离决定跳跃或停下，不能直接掉下去
    const dist = Math.abs(player.x - enemy.x);
    const playerAcross = dir > 0 ? player.x > enemy.x : player.x < enemy.x;
    if (playerAcross && dist <= this.maxJumpDistance) {
      enemy.jumping = true;
      enemy.vy = JUMP_VY;
      enemy.vx = dir * JUMP_VX;
      enemy.jumpStartY = enemy.y;
    }
    // 否则停在边缘
  }

  // 简单分离行为：多个敌人不能重叠
  applySeparation(others) {
    const enemy = this.enemy;
    if (!enemy.solid) return;
    for (const other of others) {
      if (!other || other === enemy || other.dead || other.solid === false) continue;
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      if (Math.abs(dx) < enemy.width && Math.abs(dy) < enemy.height) {
        const overlap = enemy.width - Math.abs(dx);
        const dir = dx === 0 ? 1 : Math.sign(dx);
        enemy.x += dir * overlap * 0.5;
      }
    }
  }
}

module.exports = { EnemyController };
