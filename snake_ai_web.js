// 贪吃蛇游戏参数
const canvas = document.getElementById('snake-canvas');
const ctx = canvas.getContext('2d');
const gridSize = 20;
const tileCount = canvas.width / gridSize;

// 游戏状态
let snake, food, direction, gameInterval, aiMode = false;

// Q-learning 参数
const ACTIONS = [
  {x: 0, y: -1}, // 上
  {x: 0, y: 1},  // 下
  {x: -1, y: 0}, // 左
  {x: 1, y: 0},  // 右
];
let Q = {}; // Q表
const alpha = 0.1; // 学习率
const gamma = 0.9; // 折扣因子
let epsilon = 0.1; // 探索率

// 日志输出
function log(msg) {
  const logDiv = document.getElementById('log');
  logDiv.innerText += msg + '\n';
  logDiv.scrollTop = logDiv.scrollHeight;
}

// 初始化游戏
function resetGame() {
  snake = [{x: 10, y: 10}];
  direction = {x: 0, y: 0};
  placeFood();
}

function placeFood() {
  food = {
    x: Math.floor(Math.random() * tileCount),
    y: Math.floor(Math.random() * tileCount)
  };
}

function draw() {
  ctx.fillStyle = '#222';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // 画蛇
  ctx.fillStyle = 'lime';
  for (const s of snake) {
    ctx.fillRect(s.x * gridSize, s.y * gridSize, gridSize-2, gridSize-2);
  }
  // 画食物
  ctx.fillStyle = 'red';
  ctx.fillRect(food.x * gridSize, food.y * gridSize, gridSize-2, gridSize-2);
}

function update() {
  // 移动蛇
  const head = {x: snake[0].x + direction.x, y: snake[0].y + direction.y};
  // 撞墙/自咬
  if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount || snake.some(s => s.x === head.x && s.y === head.y)) {
    log('Game over');
    clearInterval(gameInterval);
    return;
  }
  snake.unshift(head);
  // 吃到食物
  if (head.x === food.x && head.y === food.y) {
    placeFood();
  } else {
    snake.pop();
  }
  draw();
}

// 键盘控制
window.addEventListener('keydown', e => {
  if (aiMode) return;
  switch(e.key) {
    case 'ArrowUp': if (direction.y !== 1) direction = {x: 0, y: -1}; break;
    case 'ArrowDown': if (direction.y !== -1) direction = {x: 0, y: 1}; break;
    case 'ArrowLeft': if (direction.x !== 1) direction = {x: -1, y: 0}; break;
    case 'ArrowRight': if (direction.x !== -1) direction = {x: 1, y: 0}; break;
  }
});

document.getElementById('start-btn').onclick = () => {
  aiMode = false;
  resetGame();
  direction = {x: 1, y: 0};
  clearInterval(gameInterval);
  gameInterval = setInterval(update, 100);
};

document.getElementById('ai-btn').onclick = () => {
  aiMode = true;
  resetGame();
  direction = {x: 1, y: 0};
  clearInterval(gameInterval);
  gameInterval = setInterval(() => {
    direction = ai_decide(snake, food, direction);
    update();
  }, 100);
};

// 训练相关
let training = false;
document.getElementById('train-btn').onclick = () => {
  if (training) return;
  training = true;
  log('Training started...');
  let episodes = parseInt(document.getElementById('epochs').value) || 10;
  let trainCount = 0;
  let totalScore = 0;
  function trainEpisode() {
    if (!training || trainCount >= episodes) {
      training = false;
      log(`Training finished! Average score: ${(totalScore/episodes).toFixed(2)}`);
      return;
    }
    // 初始化
    let _snake = [{x: 10, y: 10}];
    let _direction = {x: 1, y: 0};
    let _food = {x: Math.floor(Math.random()*tileCount), y: Math.floor(Math.random()*tileCount)};
    let score = 0;
    let alive = true;
    let steps = 0;
    while (alive && steps < 200) {
      const state = getState(_snake, _food, _direction);
      let actionIdx = chooseAction(state);
      let action = ACTIONS[actionIdx];
      // 计算新头部
      const head = {x: _snake[0].x + action.x, y: _snake[0].y + action.y};
      // 撞墙/自咬
      if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount || _snake.some(s => s.x === head.x && s.y === head.y)) {
        updateQ(state, actionIdx, -10, state); // 死亡惩罚
        alive = false;
        break;
      }
      _snake.unshift(head);
      let reward = 0;
      // 吃到食物
      if (head.x === _food.x && head.y === _food.y) {
        reward = 10;
        score++;
        _food = {x: Math.floor(Math.random()*tileCount), y: Math.floor(Math.random()*tileCount)};
      } else {
        _snake.pop();
        reward = -0.1; // 活着惩罚
      }
      const nextState = getState(_snake, _food, action);
      updateQ(state, actionIdx, reward, nextState);
      _direction = action;
      steps++;
    }
    totalScore += score;
    trainCount++;
    if (trainCount % 10 === 0) log(`Trained ${trainCount} episodes...`);
    setTimeout(trainEpisode, 0);
  }
  trainEpisode();
};

document.getElementById('stop-train-btn').onclick = () => {
  training = false;
  log('Training stopped.');
};

// 状态编码（简化：蛇头与食物的相对位置+当前方向）
function getState(snake, food, direction) {
  const head = snake[0];
  const dx = food.x - head.x;
  const dy = food.y - head.y;
  return `${dx},${dy},${direction.x},${direction.y}`;
}

// 选择动作（epsilon-greedy）
function chooseAction(state) {
  if (Math.random() < epsilon) {
    return Math.floor(Math.random() * ACTIONS.length);
  }
  if (!Q[state]) Q[state] = [0,0,0,0];
  let maxQ = Math.max(...Q[state]);
  let actions = [];
  Q[state].forEach((q, i) => { if (q === maxQ) actions.push(i); });
  return actions[Math.floor(Math.random() * actions.length)];
}

// Q值更新
function updateQ(state, action, reward, nextState) {
  if (!Q[state]) Q[state] = [0,0,0,0];
  if (!Q[nextState]) Q[nextState] = [0,0,0,0];
  Q[state][action] = Q[state][action] + alpha * (reward + gamma * Math.max(...Q[nextState]) - Q[state][action]);
}

// AI决策（推理模式：贪心）
function ai_decide(snake, food, direction) {
  const state = getState(snake, food, direction);
  if (!Q[state]) Q[state] = [0,0,0,0];
  let maxQ = Math.max(...Q[state]);
  let actions = [];
  Q[state].forEach((q, i) => { if (q === maxQ) actions.push(i); });
  return ACTIONS[actions[Math.floor(Math.random() * actions.length)]];
}

// 模型导入导出
function downloadQTable() {
  const blob = new Blob([JSON.stringify(Q)], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'snake_q_table.json';
  a.click();
  URL.revokeObjectURL(url);
}
document.getElementById('download-model-btn').onclick = () => {
  log('Exporting model...');
  downloadQTable();
};
document.getElementById('model-upload').onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  log('Loading model: ' + file.name);
  const reader = new FileReader();
  reader.onload = function(evt) {
    try {
      Q = JSON.parse(evt.target.result);
      log('Model loaded successfully!');
    } catch {
      log('Model file format error.');
    }
  };
  reader.readAsText(file);
};

draw();
log('Welcome to Snake AI Web!'); 