const { Enemy } = require('../src/entities/enemy.js');
const { EnemyController } = require('../src/ai/enemyController.js');
const { StateMachine, VALID_STATES } = require('../src/ai/stateMachine.js');

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

describe('平台边缘与悬崖', () => {
  test('巡逻到边缘转身且不继续前进', () => {
    const enemy = new Enemy(190, 100);
    const ctrl = new EnemyController(enemy);
    ctrl.patrolDir = 1;
    ctrl.update(0.1, { x: 1000, y: 100 });
    expect(ctrl.patrolDir).toBe(-1);
    expect(enemy.x).toBe(190); // 没有越过边缘
    ctrl.update(0.1, { x: 1000, y: 100 });
    expect(enemy.x).toBeLessThan(190); // 转身后反向巡逻
  });

  test('巡逻途中持续检测脚下地面', () => {
    const enemy = new Enemy(0, 100);
    const ctrl = new EnemyController(enemy);
    ctrl.update(0.1, { x: 1000, y: 100 });
    expect(ctrl.fsm.state).toBe('patrol');
    expect(enemy.x).toBeGreaterThan(0); // 有地面时正常前进
  });

  test('追击悬崖且玩家在对面近距离时跳跃', () => {
    const platforms = [
      { x: -200, y: 48, width: 200 }, // [-200, 0]
      { x: 60, y: 48, width: 200 },   // [60, 260]，中间是悬崖
    ];
    const enemy = new Enemy(-33, 0);
    const ctrl = new EnemyController(enemy, { platforms });
    const player = { x: 60, y: 0 }; // 距离 93，在可跳范围内
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('chase');
    expect(enemy.jumping).toBe(true);
    expect(enemy.vy).toBeLessThan(0); // 向上起跳
    expect(enemy.vx).toBeGreaterThan(0); // 朝玩家方向
  });

  test('追击悬崖距离过远时停在边缘不掉下去', () => {
    const platforms = [
      { x: -200, y: 48, width: 200 },
      { x: 60, y: 48, width: 200 },
    ];
    const enemy = new Enemy(-33, 0);
    const ctrl = new EnemyController(enemy, { platforms });
    const player = { x: 120, y: 0 }; // 距离 153，超出跳跃距离但在追击范围内
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('chase');
    expect(enemy.jumping).toBe(false);
    expect(enemy.x).toBe(-33); // 停在边缘
    ctrl.update(0.1, player);
    expect(enemy.x).toBe(-33); // 持续多帧也不会掉下去
    expect(enemy.y).toBe(0);
  });
});

describe('状态机', () => {
  test('状态集合完整且互斥', () => {
    expect(VALID_STATES).toEqual(['idle', 'patrol', 'chase', 'attack', 'hurt', 'dead']);
    const fsm = new StateMachine();
    fsm.changeState('attack');
    expect(() => fsm.changeState('patrol')).toThrow(); // 攻击锁定期间互斥
    fsm.update(1.0); // 攻击结束后解锁
    fsm.changeState('patrol');
    expect(fsm.state).toBe('patrol');
  });

  test('非法状态与死亡终态', () => {
    const fsm = new StateMachine();
    expect(() => fsm.changeState('fly')).toThrow();
    fsm.changeState('dead', { force: true });
    expect(() => fsm.changeState('idle')).toThrow();
    expect(() => fsm.changeState('idle', { force: true })).toThrow(); // 死亡不可复活
  });

  test('状态切换触发进入退出回调并清理计时器和标志', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const events = [];
    ctrl.fsm.on('patrol', {
      onEnter: () => events.push('enter'),
      onExit: () => events.push('exit'),
    });
    ctrl.fsm.changeState('patrol');
    ctrl.fsm.update(0.5);
    ctrl.fsm.changeState('idle');
    expect(events).toEqual(['enter', 'exit']);
    expect(ctrl.fsm.stateTime).toBe(0); // 切换后计时器重置
    // 攻击标志在退出时被清理
    ctrl.fsm.changeState('attack');
    ctrl.attackDidHit = true;
    ctrl.fsm.update(1.0);
    ctrl.fsm.changeState('idle');
    expect(ctrl.attackDidHit).toBe(false);
  });
});

describe('攻击', () => {
  test('攻击范围判定', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    ctrl.update(0.1, { x: 30, y: 0 }); // <= 40 攻击范围
    expect(ctrl.fsm.state).toBe('attack');
    const enemy2 = new Enemy(0, 0);
    const ctrl2 = new EnemyController(enemy2);
    ctrl2.update(0.1, { x: 60, y: 0 }); // 超出攻击范围但在追击范围
    expect(ctrl2.fsm.state).toBe('chase');
  });

  test('前摇期间无伤害，前摇结束后造成一次伤害', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = { x: 30, y: 0, health: 10 };
    ctrl.update(0.01, player); // 进入 attack
    ctrl.update(0.1, player); // 前摇中（stateTime 0.11 < 0.25）
    expect(player.health).toBe(10);
    expect(ctrl.attackDidHit).toBe(false);
    ctrl.update(0.2, player); // 前摇结束（stateTime 0.31 >= 0.25）
    expect(player.health).toBe(7);
    ctrl.update(0.1, player); // 后摇中不会重复命中
    expect(player.health).toBe(7);
  });

  test('后摇期间不能移动', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = { x: 30, y: 0, health: 10 };
    ctrl.update(0.01, player); // 进入 attack
    ctrl.update(0.3, player); // 前摇结束，进入后摇
    const xBefore = enemy.x;
    ctrl.update(0.1, { x: 1000, y: 0 }); // 玩家跑远，但后摇不能移动
    expect(ctrl.fsm.state).toBe('attack');
    expect(enemy.x).toBe(xBefore);
  });

  test('前摇期间可以被打断', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = { x: 30, y: 0, health: 10 };
    ctrl.update(0.01, player);
    ctrl.update(0.1, player); // 前摇中
    expect(ctrl.fsm.state).toBe('attack');
    enemy.takeDamage(1);
    expect(ctrl.fsm.state).toBe('hurt'); // 被打断进入硬直
    expect(ctrl.attackDidHit).toBe(false); // 退出 attack 时标志被清理
  });
});

describe('受伤与死亡', () => {
  test('硬直期间不能移动或攻击，可被连续攻击', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    enemy.takeDamage(2);
    expect(ctrl.fsm.state).toBe('hurt');
    const xBefore = enemy.x;
    ctrl.update(0.1, { x: 10, y: 0, health: 10 }); // 玩家在攻击范围内
    expect(enemy.x).toBe(xBefore); // 硬直不能移动
    expect(ctrl.fsm.state).toBe('hurt'); // 硬直不能转为攻击
    enemy.takeDamage(2); // 连续攻击刷新硬直
    expect(ctrl.fsm.state).toBe('hurt');
    expect(enemy.hitstun).toBeGreaterThan(0.2);
    ctrl.update(0.5, { x: 1000, y: 0 }); // 硬直结束
    expect(ctrl.fsm.state).not.toBe('hurt');
  });

  test('死亡后从碰撞系统移除且不再更新', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    enemy.takeDamage(20);
    expect(enemy.dead).toBe(true);
    expect(enemy.solid).toBe(false); // 不再阻挡玩家
    expect(ctrl.fsm.state).toBe('dead');
    ctrl.update(0.1, { x: 10, y: 0 });
    expect(enemy.x).toBe(0); // 尸体不再移动
    expect(enemy.health).toBe(0);
  });
});

describe('多敌人与AI评估', () => {
  test('多个敌人不能重叠，会被分离', () => {
    const e1 = new Enemy(0, 0);
    const e2 = new Enemy(10, 0);
    const ctrl = new EnemyController(e1);
    const farPlayer = { x: 1000, y: 0 };
    ctrl.update(0.1, farPlayer, [e2]);
    expect(Math.abs(e1.x - e2.x)).toBeGreaterThan(10);
    for (let i = 0; i < 10; i++) ctrl.update(0.1, farPlayer, [e2]);
    expect(Math.abs(e1.x - e2.x)).toBeGreaterThanOrEqual(e1.width * 0.5);
  });

  test('死亡敌人不参与分离', () => {
    const e1 = new Enemy(0, 0);
    const e2 = new Enemy(10, 0);
    e2.takeDamage(20); // e2 死亡，碰撞已移除
    const ctrl = new EnemyController(e1);
    ctrl.update(0.1, { x: 1000, y: 0 }, [e2]);
    expect(Math.abs(e1.x)).toBeLessThan(5); // 不会被尸体推开
  });

  test('AI决策每帧重新评估，不缓存', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    ctrl.update(0.1, { x: 50, y: 0 });
    expect(ctrl.fsm.state).toBe('chase');
    ctrl.update(0.1, { x: 500, y: 0 }); // 玩家离开范围，立即退出追击
    expect(ctrl.fsm.state).not.toBe('chase');
    ctrl.update(0.1, { x: 50, y: 0 }); // 玩家回到范围，立即重新追击
    expect(ctrl.fsm.state).toBe('chase');
  });

  test('idle超时后进入巡逻', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy, { idleTimeout: 0.5 });
    const farPlayer = { x: 1000, y: 0 };
    ctrl.update(0.2, farPlayer);
    expect(ctrl.fsm.state).toBe('idle');
    ctrl.update(0.2, farPlayer);
    expect(ctrl.fsm.state).toBe('idle'); // 0.4s 未到超时
    ctrl.update(0.2, farPlayer);
    expect(ctrl.fsm.state).toBe('patrol'); // 0.6s 超时进入巡逻
  });

  test('玩家在范围外不触发追击', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    ctrl.update(0.1, { x: 500, y: 0 });
    expect(ctrl.fsm.state).not.toBe('chase');
    expect(ctrl.fsm.state).not.toBe('attack');
  });
});
