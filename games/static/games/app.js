const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const ACTIVE_GAME_KEY = "gamehub.activeGame";
const state = {
  authMode: "login",
  username: "",
  gameId: null,
  gameType: null,
  mode: null,
  busy: false,
  friendPollTimer: null,
  matchPollTimer: null,
};

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  return parts.length === 2 ? parts.pop().split(";").shift() : "";
}

async function api(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if ((options.method || "GET") !== "GET") headers["X-CSRFToken"] = getCookie("csrftoken");

  let response;
  try {
    response = await fetch(url, { credentials: "same-origin", ...options, headers });
  } catch {
    throw new ApiError("Network error. Check that the Django server is running.", 0);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || `Request failed (${response.status})`, response.status);
  return data;
}

function rememberGame(game) {
  sessionStorage.setItem(ACTIVE_GAME_KEY, JSON.stringify({
    id: game.id,
    gameType: game.game_type,
    mode: game.mode || "SOLO",
  }));
}

function forgetGame() {
  sessionStorage.removeItem(ACTIVE_GAME_KEY);
}

function stopMatchPolling() {
  if (state.matchPollTimer) clearInterval(state.matchPollTimer);
  state.matchPollTimer = null;
}

function stopFriendPolling() {
  if (state.friendPollTimer) clearInterval(state.friendPollTimer);
  state.friendPollTimer = null;
}

function setAuthenticated(username) {
  state.username = username;
  $("#authSection").classList.add("hidden");
  $("#gameSection").classList.remove("hidden");
  $("#userArea").classList.remove("hidden");
  $("#usernameLabel").textContent = `👤 ${username}`;
  startFriendPolling();
}

function setLoggedOut() {
  state.username = "";
  stopFriendPolling();
  stopMatchPolling();
  $("#authSection").classList.remove("hidden");
  $("#gameSection").classList.add("hidden");
  $("#userArea").classList.add("hidden");
  forgetGame();
  showLobby(false);
}

async function bootstrap() {
  try {
    const me = await api("/api/auth/me/");
    if (!me.authenticated) {
      setLoggedOut();
      return;
    }
    setAuthenticated(me.username);
    await restoreActiveGame();
    await refreshFriendState(true);
  } catch {
    setLoggedOut();
  }
}

$$('.auth-tab').forEach((button) => button.addEventListener('click', () => {
  state.authMode = button.dataset.mode;
  $$('.auth-tab').forEach((item) => item.classList.toggle('active', item === button));
  const register = state.authMode === 'register';
  $('#authTitle').textContent = register ? 'Create your account' : 'Welcome back';
  $('#authHint').textContent = register ? 'Register once, then invite a friend.' : 'Login to start playing.';
  $('#authSubmit').textContent = register ? 'Create account' : 'Login';
  $('#passwordInput').autocomplete = register ? 'new-password' : 'current-password';
  $('#authMessage').textContent = '';
}));

$('#authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;

  const payload = {
    username: $('#usernameInput').value.trim(),
    password: $('#passwordInput').value,
  };

  state.busy = true;
  $('#authSubmit').disabled = true;
  $('#authMessage').textContent = '';
  try {
    const data = await api(`/api/auth/${state.authMode}/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthenticated(data.username);
    $('#authForm').reset();
    await restoreActiveGame();
    await refreshFriendState(true);
  } catch (error) {
    $('#authMessage').textContent = error.message;
  } finally {
    state.busy = false;
    $('#authSubmit').disabled = false;
  }
});

$('#logoutBtn').addEventListener('click', async () => {
  if (state.busy) return;
  state.busy = true;
  $('#logoutBtn').disabled = true;
  try {
    await api('/api/auth/logout/', { method: 'POST' });
  } finally {
    state.busy = false;
    $('#logoutBtn').disabled = false;
    setLoggedOut();
  }
});

$$('[data-start]').forEach((button) => button.addEventListener('click', () => startGame(button.dataset.start)));
$('#newGameBtn').addEventListener('click', () => {
  if (state.mode === 'SOLO' && state.gameType) startGame(state.gameType);
});
$('#forfeitMatchBtn').addEventListener('click', forfeitFriendMatch);
$('#backLobbyBtn').addEventListener('click', () => {
  forgetGame();
  showLobby();
});

$('#addFriendBtn').addEventListener('click', async () => {
  $('#friendPanel').classList.remove('hidden');
  $('#friendUsername').focus();
  await refreshFriendState(true);
});

$('#closeFriendPanelBtn').addEventListener('click', () => {
  $('#friendPanel').classList.add('hidden');
  $('#friendMessage').textContent = '';
});

$('#friendForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (state.busy) return;

  const username = $('#friendUsername').value.trim();
  if (!username) return;

  state.busy = true;
  $('#sendFriendBtn').disabled = true;
  $('#friendMessage').textContent = '';
  try {
    await api('/api/games/friends/request/', {
      method: 'POST',
      body: JSON.stringify({ username }),
    });
    $('#friendUsername').value = '';
    $('#friendMessage').textContent = `Invite sent to ${username}.`;
    await refreshFriendState(true);
  } catch (error) {
    $('#friendMessage').textContent = error.message;
  } finally {
    state.busy = false;
    $('#sendFriendBtn').disabled = false;
  }
});

async function startGame(gameType) {
  if (state.busy || !gameType) return;
  state.busy = true;
  setGameControlsDisabled(true);
  try {
    const game = await api('/api/games/start/', {
      method: 'POST',
      body: JSON.stringify({ game_type: gameType }),
    });
    openGame(game);
  } catch (error) {
    if (error.status === 401) setLoggedOut();
    else alert(error.message);
  } finally {
    state.busy = false;
    setGameControlsDisabled(false);
  }
}

function openGame(game) {
  state.gameId = game.id;
  state.gameType = game.game_type;
  state.mode = game.mode || 'SOLO';
  rememberGame(game);

  $('#lobby').classList.add('hidden');
  $('#playArea').classList.remove('hidden');
  $('#backLobbyBtn').classList.remove('hidden');
  if (state.mode === 'FRIEND') startMatchPolling();
  else stopMatchPolling();
  renderGame(game);
}

async function restoreActiveGame() {
  let saved;
  try {
    saved = JSON.parse(sessionStorage.getItem(ACTIVE_GAME_KEY) || 'null');
  } catch {
    forgetGame();
    return;
  }
  if (!saved?.id) return;

  const url = saved.mode === 'FRIEND'
    ? `/api/games/friend-match/${saved.id}/`
    : `/api/games/${saved.id}/`;
  try {
    openGame(await api(url));
  } catch (error) {
    if (error.status === 401) setLoggedOut();
    else {
      forgetGame();
      showLobby();
    }
  }
}

function showLobby(refresh = true) {
  stopMatchPolling();
  state.gameId = null;
  state.gameType = null;
  state.mode = null;
  $('#lobby').classList.remove('hidden');
  $('#playArea').classList.add('hidden');
  $('#backLobbyBtn').classList.add('hidden');
  $('#newGameBtn').classList.remove('hidden');
  $('#forfeitMatchBtn').classList.add('hidden');
  if (refresh && state.username) refreshFriendState(true);
}

function setGameControlsDisabled(disabled) {
  $$('[data-start], #newGameBtn, #backLobbyBtn, #addFriendBtn').forEach((button) => {
    button.disabled = disabled;
  });
}

async function move(moveValue) {
  if (!state.gameId || state.busy) return;
  state.busy = true;
  const url = state.mode === 'FRIEND'
    ? `/api/games/friend-match/${state.gameId}/move/`
    : `/api/games/${state.gameId}/move/`;

  try {
    const game = await api(url, {
      method: 'POST',
      body: JSON.stringify({ move: moveValue }),
    });
    rememberGame(game);
    renderGame(game);
    if (game.state.status === 'FINISHED') stopMatchPolling();
  } catch (error) {
    if (error.status === 401) {
      setLoggedOut();
      return;
    }
    $('#gameMessage').textContent = error.message;
  } finally {
    state.busy = false;
  }
}


async function forfeitFriendMatch() {
  if (state.mode !== 'FRIEND' || !state.gameId || state.busy) return;
  if (!window.confirm('Forfeit this match? Your opponent will win and the match will close.')) return;

  state.busy = true;
  $('#forfeitMatchBtn').disabled = true;
  try {
    const game = await api(`/api/games/friend-match/${state.gameId}/forfeit/`, { method: 'POST' });
    renderGame(game);
    stopMatchPolling();
    await refreshFriendState(true);
  } catch (error) {
    $('#gameMessage').textContent = error.message;
  } finally {
    state.busy = false;
    $('#forfeitMatchBtn').disabled = false;
  }
}

function renderGame(game) {
  state.gameId = game.id;
  state.gameType = game.game_type;
  state.mode = game.mode || state.mode || 'SOLO';
  $('#gameMessage').textContent = game.state.message || '';
  $('#newGameBtn').classList.toggle('hidden', state.mode === 'FRIEND');
  $('#forfeitMatchBtn').classList.toggle('hidden', !(state.mode === 'FRIEND' && game.state.status === 'ACTIVE'));

  if (game.game_type === 'TIC_TAC_TOE') renderTic(game.state);
  else renderBingo(game.state, game.game_type === 'BINGO_FRIEND');
}

function renderTic(gameState) {
  $('#gameTypeLabel').textContent = '3 × 3 CLASSIC';
  $('#gameTitle').textContent = 'Tic-Tac-Toe';
  $('#ticArea').classList.remove('hidden');
  $('#bingoArea').classList.add('hidden');

  const board = $('#ticBoard');
  board.innerHTML = '';
  gameState.board.forEach((value, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `tic-cell ${value ? value.toLowerCase() : ''}`;
    button.textContent = value || '';
    button.disabled = Boolean(value) || gameState.status !== 'ACTIVE' || state.busy;
    button.setAttribute('aria-label', value ? `Square ${index + 1}: ${value}` : `Square ${index + 1}: empty`);
    button.addEventListener('click', () => move(index));
    board.appendChild(button);
  });
}

function renderBingo(gameState, friendMode) {
  $('#gameTypeLabel').textContent = friendMode ? 'PRIVATE 2 PLAYER' : 'CPU BINGO';
  $('#gameTitle').textContent = friendMode ? `Bingo vs ${gameState.opponent_name}` : 'Bingo vs Computer';
  $('#ticArea').classList.add('hidden');
  $('#bingoArea').classList.remove('hidden');

  $('#userLines').textContent = `${Math.min(gameState.my_lines, 5)} / 5`;
  $('#opponentLabel').textContent = gameState.opponent_name || 'Opponent';
  $('#opponentLines').textContent = gameState.opponent_lines == null
    ? 'Hidden'
    : `${Math.min(gameState.opponent_lines, 5)} / 5`;

  const myCalls = new Set(gameState.my_calls || []);
  const opponentCalls = new Set(gameState.opponent_calls || []);
  const allCalled = new Set(gameState.all_called || []);
  const completedIndexes = new Set((gameState.completed_lines || []).flat());
  const board = $('#bingoBoard');
  board.innerHTML = '';

  (gameState.board || []).forEach((number, index) => {
    const button = document.createElement('button');
    const mine = myCalls.has(number);
    const theirs = opponentCalls.has(number);
    const completed = completedIndexes.has(index);

    button.type = 'button';
    button.className = [
      'bingo-cell',
      mine ? 'call-own' : '',
      theirs ? 'call-opponent' : '',
      completed ? 'line-complete' : '',
    ].filter(Boolean).join(' ');
    button.textContent = number;
    button.disabled = allCalled.has(number)
      || gameState.status !== 'ACTIVE'
      || !gameState.my_turn
      || state.busy;
    button.setAttribute('aria-label', mine
      ? `Number ${number}, your call`
      : theirs
        ? `Number ${number}, opponent call`
        : `Call number ${number}`);
    button.addEventListener('click', () => move(number));
    board.appendChild(button);
  });

  if (gameState.last_call) {
    $('#bingoCalls').textContent = gameState.last_call.owner === 'YOU'
      ? `Last call: ${gameState.last_call.number} — yours (green)`
      : `Last call: ${gameState.last_call.number} — ${gameState.opponent_name} (red)`;
  } else if (friendMode) {
    $('#bingoCalls').textContent = gameState.my_turn
      ? 'You start. Pick any number.'
      : `Waiting for ${gameState.opponent_name}.`;
  } else {
    const last = (gameState.opponent_calls || []).at(-1);
    $('#bingoCalls').textContent = last
      ? `Computer last called ${last} (red). Your calls are green.`
      : 'Pick your first number. Your calls are green.';
  }
}

function emptyRow(text) {
  const row = document.createElement('div');
  row.className = 'friend-empty';
  row.textContent = text;
  return row;
}

function renderFriendState(data) {
  const incoming = $('#incomingRequests');
  const outgoing = $('#outgoingRequests');
  const matches = $('#activeMatches');
  incoming.innerHTML = '';
  outgoing.innerHTML = '';
  matches.innerHTML = '';

  if (!data.incoming.length) incoming.appendChild(emptyRow('No incoming invites.'));
  data.incoming.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'friend-row';
    const name = document.createElement('span');
    name.textContent = item.username;
    const actions = document.createElement('div');
    actions.className = 'friend-row-actions';

    const accept = document.createElement('button');
    accept.type = 'button';
    accept.className = 'mini-action accept';
    accept.textContent = 'Accept';
    accept.addEventListener('click', () => acceptFriendRequest(item.id));

    const decline = document.createElement('button');
    decline.type = 'button';
    decline.className = 'mini-action';
    decline.textContent = 'Decline';
    decline.addEventListener('click', () => declineFriendRequest(item.id));

    actions.append(accept, decline);
    row.append(name, actions);
    incoming.appendChild(row);
  });

  if (!data.outgoing.length) outgoing.appendChild(emptyRow('No pending sent invites.'));
  data.outgoing.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'friend-row';
    const name = document.createElement('span');
    name.textContent = item.username;
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mini-action';
    cancel.textContent = 'Cancel';
    cancel.addEventListener('click', () => cancelFriendRequest(item.id));
    row.append(name, cancel);
    outgoing.appendChild(row);
  });

  if (!data.active_matches.length) matches.appendChild(emptyRow('No active friend matches.'));
  data.active_matches.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'friend-row';
    const info = document.createElement('div');
    const name = document.createElement('strong');
    name.textContent = item.opponent_name;
    const turn = document.createElement('small');
    turn.textContent = item.my_turn ? 'Your turn' : 'Opponent turn';
    info.append(name, turn);

    const open = document.createElement('button');
    open.type = 'button';
    open.className = 'mini-action accept';
    open.textContent = 'Open';
    open.addEventListener('click', () => openFriendMatch(item.id));
    row.append(info, open);
    matches.appendChild(row);
  });
}

async function refreshFriendState(silent = false) {
  if (!state.username) return;
  try {
    renderFriendState(await api('/api/games/friends/state/'));
  } catch (error) {
    if (error.status === 401) setLoggedOut();
    else if (!silent) $('#friendMessage').textContent = error.message;
  }
}

function startFriendPolling() {
  stopFriendPolling();
  state.friendPollTimer = setInterval(() => refreshFriendState(true), 2000);
}

async function acceptFriendRequest(requestId) {
  if (state.busy) return;
  state.busy = true;
  try {
    const game = await api(`/api/games/friends/${requestId}/accept/`, { method: 'POST' });
    openGame(game);
    await refreshFriendState(true);
  } catch (error) {
    $('#friendMessage').textContent = error.message;
  } finally {
    state.busy = false;
  }
}

async function declineFriendRequest(requestId) {
  if (state.busy) return;
  state.busy = true;
  try {
    await api(`/api/games/friends/${requestId}/decline/`, { method: 'POST' });
    await refreshFriendState(true);
  } catch (error) {
    $('#friendMessage').textContent = error.message;
  } finally {
    state.busy = false;
  }
}

async function cancelFriendRequest(requestId) {
  if (state.busy) return;
  state.busy = true;
  try {
    await api(`/api/games/friends/${requestId}/cancel/`, { method: 'POST' });
    await refreshFriendState(true);
  } catch (error) {
    $('#friendMessage').textContent = error.message;
  } finally {
    state.busy = false;
  }
}

async function openFriendMatch(matchId) {
  if (state.busy) return;
  state.busy = true;
  try {
    openGame(await api(`/api/games/friend-match/${matchId}/`));
  } catch (error) {
    $('#friendMessage').textContent = error.message;
  } finally {
    state.busy = false;
  }
}

function startMatchPolling() {
  stopMatchPolling();
  state.matchPollTimer = setInterval(async () => {
    if (state.mode !== 'FRIEND' || !state.gameId || state.busy) return;
    try {
      const game = await api(`/api/games/friend-match/${state.gameId}/`);
      renderGame(game);
      if (game.state.status === 'FINISHED') stopMatchPolling();
    } catch (error) {
      if (error.status === 401) setLoggedOut();
    }
  }, 1000);
}

bootstrap();
