const { Enemy } = require('../src/entities/enemy.js');
const { EnemyController } = require('../src/ai/enemyController.js');
const { StateMachine } = require('../src/ai/stateMachine.js');
const { World } = require('../src/engine/world.js');

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
    const enemy = new Enemy(0, 100);
    const ctrl = new EnemyController(enemy);
    const player = {x: 1000, y: 100};
    ctrl.patrolDir = 1;
    enemy.x = 190;
    ctrl.update(0.1, player);
    expect(ctrl.patrolDir).toBe(-1);
    expect(enemy.x).toBe(190); // 没有走出边缘
    expect(enemy.onGround).toBe(true);
  });

  test('追击时前方是悬崖且玩家距离可及则跳跃', () => {
    const world = new World();
    world.addPlatform(-200, 48, 300, 20); // [-200, 100]
    world.addPlatform(160, 48, 240, 20);  // [160, 400]
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy, world);
    const player = {x: 50, y: 0, health: 10};
    ctrl.update(0.05, player); // 进入追击
    expect(ctrl.fsm.state).toBe('chase');
    player.x = 200; // 玩家跳到对面平台
    let jumped = false;
    for (let i = 0; i < 60; i++) {
      ctrl.update(0.05, player);
      if (!enemy.onGround) jumped = true;
    }
    expect(jumped).toBe(true);          // 起跳过崖
    expect(enemy.onGround).toBe(true);  // 已落地，没有一直掉下去
    expect(enemy.x + enemy.width).toBeGreaterThan(160); // 越过缺口到达对面
  });

  test('追击时悬崖对面玩家太远则停下不掉落', () => {
    const world = new World();
    world.addPlatform(-200, 48, 300, 20);
    world.addPlatform(160, 48, 240, 20);
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy, world);
    const player = {x: 50, y: 0, health: 10};
    ctrl.update(0.05, player);
    player.x = 280; // 对面但超出跳跃距离
    for (let i = 0; i < 30; i++) ctrl.update(0.05, player);
    expect(ctrl.fsm.state).toBe('chase');
    expect(enemy.onGround).toBe(true); // 没有掉下悬崖
    expect(enemy.y).toBe(0);
    expect(enemy.x + enemy.width).toBeLessThanOrEqual(100); // 停在边缘内
  });
});

describe('状态机', () => {
  test('死亡是终态，硬直中不可切换', () => {
    const fsm = new StateMachine();
    fsm.changeState('hurt');
    expect(() => fsm.changeState('patrol')).toThrow();
    fsm.changeState('dead');
    expect(() => fsm.changeState('idle')).toThrow();
    expect(fsm.state).toBe('dead');
  });

  test('攻击前摇可被受伤打断，连续受击刷新硬直', () => {
    const fsm = new StateMachine();
    fsm.changeState('attack');
    fsm.changeState('hurt'); // 前摇期间允许被打断
    expect(fsm.state).toBe('hurt');
    fsm.update(0.2);
    fsm.changeState('hurt'); // 连续受击
    expect(fsm.stateTime).toBe(0);
  });

  test('状态切换触发进入退出回调并清理计时器和标志', () => {
    const fsm = new StateMachine();
    const entered = [];
    const exited = [];
    fsm.onEnter('attack', () => entered.push('attack'));
    fsm.onExit('attack', () => exited.push('attack'));
    fsm.changeState('attack');
    fsm.setFlag('dealtDamage', true);
    fsm.setTimer('swing', 5);
    fsm.update(1.0); // 攻击计时结束自动回 idle
    expect(fsm.state).toBe('idle');
    expect(entered).toEqual(['attack']);
    expect(exited).toEqual(['attack']);
    expect(fsm.flags.dealtDamage).toBeUndefined(); // 标志已清理
    expect(fsm.timers.swing).toBeUndefined();      // 计时器已清理
  });
});

describe('攻击与硬直', () => {
  test('前摇期间无伤害，后摇期间不能移动', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = {x: 40, y: 0, health: 10};
    ctrl.update(0.1, player); // idle -> chase -> attack
    expect(ctrl.fsm.state).toBe('attack');
    ctrl.update(0.1, player); // stateTime 0.1 < 前摇
    ctrl.update(0.1, player); // stateTime 0.2 < 前摇
    expect(player.health).toBe(10); // 前摇期间还没有伤害
    ctrl.update(0.1, player); // stateTime 0.3 >= 前摇，结算伤害
    expect(player.health).toBe(7);
    for (let i = 0; i < 4; i++) ctrl.update(0.1, player); // 后摇期间
    expect(enemy.x).toBe(0); // 整个攻击期间没有移动
  });

  test('攻击范围判定：范围外不攻击不掉血', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = {x: 90, y: 0, health: 10}; // 追击范围内、攻击范围外
    for (let i = 0; i < 6; i++) ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('chase');
    expect(player.health).toBe(10);
  });

  test('前摇期间受击被打断且未结算伤害', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = {x: 40, y: 0, health: 10};
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('attack');
    enemy.takeDamage(2);
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('hurt');
    expect(player.health).toBe(10);
  });

  test('硬直期间不能移动，可被连续攻击刷新', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = {x: 30, y: 0, health: 10};
    enemy.takeDamage(3);
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('hurt');
    expect(enemy.x).toBe(0); // 硬直期间不移动
    enemy.takeDamage(3); // 连续攻击
    expect(enemy.hitstun).toBeCloseTo(0.3); // 硬直被刷新
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('hurt');
    expect(enemy.x).toBe(0);
  });
});

describe('死亡与碰撞', () => {
  test('死亡后从碰撞系统移除且不再阻挡', () => {
    const world = new World();
    world.addPlatform(-200, 48, 400, 20);
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy, world);
    expect(world.enemies).toContain(enemy);
    enemy.takeDamage(20);
    expect(enemy.dead).toBe(true);
    expect(enemy.solid).toBe(false); // 不再阻挡玩家
    expect(world.enemies).not.toContain(enemy); // 从碰撞系统移除
    ctrl.update(0.1, {x: 10, y: 0});
    expect(ctrl.fsm.state).toBe('dead');
    expect(enemy.x).toBe(0); // 尸体不再移动
  });

  test('多个敌人不能重叠，会相互分离', () => {
    const world = new World();
    world.addPlatform(-200, 48, 400, 20);
    const a = new Enemy(0, 0);
    const b = new Enemy(10, 0); // 与 a 重叠
    const ca = new EnemyController(a, world);
    const cb = new EnemyController(b, world);
    const player = {x: 10000, y: 0};
    for (let i = 0; i < 10; i++) {
      ca.update(0.05, player);
      cb.update(0.05, player);
    }
    expect(Math.abs(a.x - b.x)).toBeGreaterThanOrEqual(a.width);
  });
});

describe('AI 决策', () => {
  test('idle 超时后进入巡逻', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    ctrl.idleTimeout = 1.0;
    const player = {x: 5000, y: 0};
    for (let i = 0; i < 3; i++) ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('idle'); // 超时前保持 idle
    for (let i = 0; i < 10; i++) ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('patrol'); // 超时后开始巡逻
  });

  test('每帧重新评估，不缓存状态', () => {
    const enemy = new Enemy(0, 0);
    const ctrl = new EnemyController(enemy);
    const player = {x: 50, y: 0};
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('chase');
    player.x = 5000; // 玩家瞬间远离
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('patrol'); // 同一帧内重新评估
    player.x = 60; // 玩家又回到范围内
    ctrl.update(0.1, player);
    expect(ctrl.fsm.state).toBe('chase');
  });
});
