

class EnemyController {
  constructor(enemy) {
    this.enemy = enemy;
    this.fsm = new StateMachine();
    this.patrolDir = 1;
  }
  update(dt, player) {
    this.fsm.update(dt);
    // BUG: 只检测前方敌人，不检测脚下地面
    const distToPlayer = Math.abs(player.x - this.enemy.x);
    if (distToPlayer < 100) {
      this.fsm.changeState('chase');
      this.enemy.x += (player.x > this.enemy.x ? 1 : -1) * 2 * dt;
      // BUG: 追击时不检测悬崖
    } else {
      this.fsm.changeState('patrol');
      this.enemy.x += this.patrolDir * 1 * dt;
    }
  }
}

module.exports = { EnemyController };
