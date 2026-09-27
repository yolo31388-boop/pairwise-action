const STATES = ['idle', 'patrol', 'chase', 'attack', 'hurt', 'dead'];

class StateMachine {
  constructor() {
    this.state = 'idle';
    this.stateTime = 0;
    this.timers = {}; // 状态内计时器，退出状态时清理
    this.flags = {};  // 状态内标志，退出状态时清理
    this.durations = { attack: 0.55, hurt: 0.3 };
    this._enterCallbacks = {};
    this._exitCallbacks = {};
  }

  onEnter(state, cb) { (this._enterCallbacks[state] ||= []).push(cb); }
  onExit(state, cb) { (this._exitCallbacks[state] ||= []).push(cb); }

  isLocked() {
    if (this.state === 'dead') return true;
    const limit = this.durations[this.state];
    return limit !== undefined && this.stateTime < limit;
  }

  canChangeTo(next) {
    if (!STATES.includes(next)) return false;
    if (this.state === 'dead') return false; // 死亡是终态
    if (next === 'dead') return true;
    // 攻击未结束（前摇+后摇）时只能被受伤打断
    if (this.state === 'attack' && this.stateTime < this.durations.attack) return next === 'hurt';
    // 硬直期间只能被再次受击刷新
    if (this.state === 'hurt' && this.stateTime < this.durations.hurt) return next === 'hurt';
    return true;
  }

  changeState(next) {
    if (!STATES.includes(next)) throw new Error(`未知状态: ${next}`);
    if (next === this.state) {
      if (next === 'hurt') this.stateTime = 0; // 连续受击刷新硬直
      return;
    }
    if (!this.canChangeTo(next)) {
      throw new Error(`非法状态切换: ${this.state} -> ${next}`);
    }
    this._exitState(this.state);
    this.state = next;
    this.stateTime = 0;
    this._enterState(next);
  }

  _exitState(state) {
    for (const cb of this._exitCallbacks[state] || []) cb(state);
    this.timers = {}; // 退出时清理计时器
    this.flags = {};  // 退出时清理标志
  }

  _enterState(state) {
    for (const cb of this._enterCallbacks[state] || []) cb(state);
  }

  setTimer(name, duration) { this.timers[name] = duration; }
  setFlag(name, value) { this.flags[name] = value; }

  update(dt) {
    this.stateTime += dt;
    for (const name of Object.keys(this.timers)) {
      this.timers[name] -= dt;
      if (this.timers[name] <= 0) delete this.timers[name];
    }
    // 攻击/硬直计时结束后自动回到 idle
    if ((this.state === 'attack' || this.state === 'hurt') &&
        this.stateTime >= this.durations[this.state]) {
      this.changeState('idle');
    }
  }
}

module.exports = { StateMachine, STATES };
