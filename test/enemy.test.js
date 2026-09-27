
const { Enemy } = require('../src/entities/enemy.js');
const { EnemyController } = require('../src/ai/enemyController.js');
const { StateMachine } = require('../src/ai/stateMachine.js');

describe('横版动作敌人AI', () => {
  test('巡逻边缘应转身', () => {
    const enemy = new Enemy(0, 100);
    const ctrl = new EnemyController(enemy);
    const player = {x: 1000, y: 100};
    // 模拟走到边缘
    ctrl.patrolDir = 1;
    enemy.x = 190;
    ctrl.update(0.1, player);
    expect(ctrl.patrolDir).toBe(-1);
  });
  test('状态互斥', () => {
    const fsm = new StateMachine();
    fsm.changeState('attack');
    expect(() => fsm.changeState('chase')).toThrow();
  });
  test('受伤硬直', () => {
    const enemy = new Enemy(0, 0);
    enemy.takeDamage(5);
    expect(enemy.hitstun).toBeGreaterThan(0);
  });
  test('死亡移除碰撞', () => {
    const enemy = new Enemy(0, 0);
    enemy.takeDamage(20);
    expect(enemy.dead).toBe(true);
  });
  test('玩家进入范围触发追击', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = {x: 50, y: 0};
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('chase');
  });
  test('攻击前摇后摇', () => {
    const fsm = new StateMachine();
    fsm.changeState('attack');
    expect(fsm.stateTime).toBe(0);
  });
});
