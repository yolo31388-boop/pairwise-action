
class StateMachine {
  constructor() { this.state = 'idle'; this.stateTime = 0; }
  changeState(state) {
    // BUG: 没有状态互斥和清理
    this.state = state;
    this.stateTime = 0;
  }
  update(dt) { this.stateTime += dt; }
}

module.exports = { StateMachine };
