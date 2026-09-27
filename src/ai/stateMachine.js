const VALID_STATES = ['idle', 'patrol', 'chase', 'attack', 'hurt', 'dead'];

// 进入这些状态时自动锁定，锁定期内禁止普通状态切换（互斥）
const LOCK_DURATIONS = {
  attack: 0.55, // 前摇 0.25 + 后摇 0.3
  hurt: 0.35, // 与受伤硬直时间一致
  dead: Infinity, // 死亡是终态
};

class StateMachine {
  constructor() {
    this.state = 'idle';
    this.stateTime = 0;
    this.locked = false;
    this.lockDuration = 0;
    this.handlers = {};
    this.timers = {};
  }

  on(state, hooks) {
    if (!VALID_STATES.includes(state)) throw new Error(`invalid state: ${state}`);
    this.handlers[state] = Object.assign(this.handlers[state] || {}, hooks);
  }

  canChange() {
    return !this.locked;
  }

  changeState(next, opts = {}) {
    if (!VALID_STATES.includes(next)) throw new Error(`invalid state: ${next}`);
    if (this.state === 'dead') throw new Error('dead is a terminal state');
    if (next === this.state && !opts.reenter) return;
    if (this.locked && !opts.force) {
      throw new Error(`cannot leave locked state: ${this.state}`);
    }
    // 退出回调：清理计时器和标志
    const exitHook = this.handlers[this.state] && this.handlers[this.state].onExit;
    if (exitHook) exitHook();
    this.timers = {};
    this.state = next;
    this.stateTime = 0;
    this.locked = false;
    this.lockDuration = 0;
    if (LOCK_DURATIONS[next] !== undefined) {
      this.locked = true;
      this.lockDuration = LOCK_DURATIONS[next];
    }
    // 进入回调
    const enterHook = this.handlers[next] && this.handlers[next].onEnter;
    if (enterHook) enterHook();
  }

  update(dt) {
    this.stateTime += dt;
    if (this.locked && this.stateTime >= this.lockDuration) {
      this.locked = false;
      this.lockDuration = 0;
    }
  }
}

module.exports = { StateMachine, VALID_STATES };
