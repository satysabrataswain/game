(function () {
  "use strict";

  var ACTIVE_GAME_KEY = "gamehub.activeGame";

  var state = {
    authMode: "login",
    username: "",
    gameId: null,
    gameType: null,
    mode: null,
    busy: false,
    friendPollTimer: null,
    matchPollTimer: null,
    pendingInviteToken: "",
  };

  function qs(selector) {
    return document.querySelector(selector);
  }

  function qsa(selector) {
    return Array.prototype.slice.call(
      document.querySelectorAll(selector)
    );
  }

  function on(selector, eventName, handler) {
    var element = qs(selector);

    if (element) {
      element.addEventListener(eventName, handler);
    }
  }

  function ApiError(message, status) {
    this.name = "ApiError";
    this.message = message;
    this.status = status;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ApiError);
    }
  }

  ApiError.prototype = Object.create(Error.prototype);
  ApiError.prototype.constructor = ApiError;

  function getCookie(name) {
    var value = "; " + document.cookie;
    var parts = value.split("; " + name + "=");

    if (parts.length === 2) {
      return parts.pop().split(";").shift();
    }

    return "";
  }

  async function api(url, options) {
    options = options || {};

    var headers = Object.assign(
      {},
      options.headers || {}
    );

    if (
      options.body &&
      !headers["Content-Type"]
    ) {
      headers["Content-Type"] = "application/json";
    }

    if (
      (options.method || "GET") !== "GET"
    ) {
      headers["X-CSRFToken"] = getCookie("csrftoken");
    }

    var fetchOptions = Object.assign(
      {},
      options,
      {
        credentials: "same-origin",
        headers: headers,
      }
    );

    var response;

    try {
      response = await fetch(
        url,
        fetchOptions
      );
    } catch (error) {
      throw new ApiError(
        "Network error. Check your internet/server connection.",
        0
      );
    }

    var data = {};

    try {
      data = await response.json();
    } catch (error) {
      data = {};
    }

    if (!response.ok) {
      throw new ApiError(
        data.error ||
          "Request failed (" +
            response.status +
            ")",
        response.status
      );
    }

    return data;
  }

  function readInviteToken() {
    var match =
      window.location.search.match(
        /[?&]invite=([^&]+)/
      );

    if (!match) {
      return "";
    }

    try {
      return decodeURIComponent(
        match[1].replace(/\+/g, " ")
      ).trim();
    } catch (error) {
      return match[1].trim();
    }
  }

  function clearInviteFromUrl() {
    if (
      !window.history ||
      !window.history.replaceState
    ) {
      return;
    }

    var url = window.location.pathname;

    if (window.location.hash) {
      url += window.location.hash;
    }

    window.history.replaceState(
      {},
      document.title,
      url
    );
  }

  function showGlobalNotice(
    message,
    isError
  ) {
    var box = qs("#globalNotice");

    if (!box) {
      return;
    }

    if (!message) {
      box.textContent = "";
      box.className =
        "global-notice hidden";
      return;
    }

    box.textContent = message;

    box.className =
      "global-notice" +
      (isError
        ? " error"
        : " success");
  }

  function rememberGame(game) {
    try {
      sessionStorage.setItem(
        ACTIVE_GAME_KEY,
        JSON.stringify({
          id: game.id,
          gameType:
            game.game_type,
          mode:
            game.mode ||
            "SOLO",
        })
      );
    } catch (error) {
      // Ignore storage errors.
    }
  }

  function forgetGame() {
    try {
      sessionStorage.removeItem(
        ACTIVE_GAME_KEY
      );
    } catch (error) {
      // Ignore storage errors.
    }
  }

  function stopMatchPolling() {
    if (state.matchPollTimer) {
      clearInterval(
        state.matchPollTimer
      );
    }

    state.matchPollTimer = null;
  }

  function stopFriendPolling() {
    if (state.friendPollTimer) {
      clearInterval(
        state.friendPollTimer
      );
    }

    state.friendPollTimer = null;
  }

  function setAuthenticated(
    username
  ) {
    state.username = username;

    qs("#authSection").classList.add(
      "hidden"
    );

    qs("#gameSection").classList.remove(
      "hidden"
    );

    qs("#userArea").classList.remove(
      "hidden"
    );

    qs("#usernameLabel").textContent =
      "👤 " + username;

    startFriendPolling();
  }

  function setLoggedOut() {
    state.username = "";

    stopFriendPolling();
    stopMatchPolling();

    qs("#authSection").classList.remove(
      "hidden"
    );

    qs("#gameSection").classList.add(
      "hidden"
    );

    qs("#userArea").classList.add(
      "hidden"
    );

    forgetGame();

    showLobby(false);

    if (
      state.pendingInviteToken
    ) {
      qs(
        "#inviteAuthHint"
      ).classList.remove(
        "hidden"
      );
    }
  }

  async function bootstrap() {
    try {
      var me = await api(
        "/api/auth/me/"
      );

      if (!me.authenticated) {
        setLoggedOut();
        return;
      }

      setAuthenticated(
        me.username
      );

      if (
        state.pendingInviteToken
      ) {
        var joined =
          await claimInviteLink();

        if (!joined) {
          await restoreActiveGame();
        }
      } else {
        await restoreActiveGame();
      }

      await refreshFriendState(
        true
      );
    } catch (error) {
      setLoggedOut();
    }
  }

  function setupAuthTabs() {
    qsa(".auth-tab").forEach(
      function (button) {
        button.addEventListener(
          "click",
          function () {
            state.authMode =
              button.getAttribute(
                "data-mode"
              ) || "login";

            qsa(
              ".auth-tab"
            ).forEach(
              function (item) {
                item.classList.toggle(
                  "active",
                  item ===
                    button
                );
              }
            );

            var register =
              state.authMode ===
              "register";

            qs(
              "#authTitle"
            ).textContent =
              register
                ? "Create your account"
                : "Welcome back";

            qs(
              "#authHint"
            ).textContent =
              register
                ? "Register once, then invite a friend."
                : "Login to start playing.";

            qs(
              "#authSubmit"
            ).textContent =
              register
                ? "Create account"
                : "Login";

            qs(
              "#passwordInput"
            ).autocomplete =
              register
                ? "new-password"
                : "current-password";

            qs(
              "#authMessage"
            ).textContent =
              "";
          }
        );
      }
    );
  }

  function setupEventHandlers() {
    setupAuthTabs();

    on(
      "#authForm",
      "submit",
      async function (event) {
        event.preventDefault();

        if (state.busy) {
          return;
        }

        var payload = {
          username: qs(
            "#usernameInput"
          ).value.trim(),

          password: qs(
            "#passwordInput"
          ).value,
        };

        state.busy = true;

        qs(
          "#authSubmit"
        ).disabled = true;

        qs(
          "#authMessage"
        ).textContent = "";

        try {
          var data =
            await api(
              "/api/auth/" +
                state.authMode +
                "/",
              {
                method: "POST",

                body:
                  JSON.stringify(
                    payload
                  ),
              }
            );

          setAuthenticated(
            data.username
          );

          qs(
            "#authForm"
          ).reset();

          if (
            state.pendingInviteToken
          ) {
            var joined =
              await claimInviteLink();

            if (!joined) {
              await restoreActiveGame();
            }
          } else {
            await restoreActiveGame();
          }

          await refreshFriendState(
            true
          );
        } catch (error) {
          qs(
            "#authMessage"
          ).textContent =
            error.message;
        } finally {
          state.busy = false;

          qs(
            "#authSubmit"
          ).disabled = false;
        }
      }
    );

    on(
      "#logoutBtn",
      "click",
      async function () {
        if (state.busy) {
          return;
        }

        state.busy = true;

        qs(
          "#logoutBtn"
        ).disabled = true;

        try {
          await api(
            "/api/auth/logout/",
            {
              method: "POST",
            }
          );
        } catch (error) {
          // logout locally
        } finally {
          state.busy = false;

          qs(
            "#logoutBtn"
          ).disabled = false;

          setLoggedOut();
        }
      }
    );

    qsa(
      "[data-start]"
    ).forEach(
      function (button) {
        button.addEventListener(
          "click",
          function () {
            startGame(
              button.getAttribute(
                "data-start"
              )
            );
          }
        );
      }
    );

    on(
      "#newGameBtn",
      "click",
      function () {
        if (
          state.mode ===
            "SOLO" &&
          state.gameType
        ) {
          startGame(
            state.gameType
          );
        }
      }
    );

    on(
      "#forfeitMatchBtn",
      "click",
      forfeitFriendMatch
    );

    on(
      "#backLobbyBtn",
      "click",
      function () {
        forgetGame();
        showLobby();
      }
    );

    on(
      "#addFriendBtn",
      "click",
      async function () {
        qs(
          "#friendPanel"
        ).classList.remove(
          "hidden"
        );

        qs(
          "#friendUsername"
        ).focus();

        await refreshFriendState(
          true
        );
      }
    );

    on(
      "#closeFriendPanelBtn",
      "click",
      function () {
        qs(
          "#friendPanel"
        ).classList.add(
          "hidden"
        );

        qs(
          "#friendMessage"
        ).textContent = "";
      }
    );

    on(
      "#friendForm",
      "submit",
      async function (event) {
        event.preventDefault();

        if (state.busy) {
          return;
        }

        var username = qs(
          "#friendUsername"
        ).value.trim();

        if (!username) {
          return;
        }

        state.busy = true;

        qs(
          "#sendFriendBtn"
        ).disabled = true;

        qs(
          "#friendMessage"
        ).textContent = "";

        try {
          await api(
            "/api/games/friends/request/",
            {
              method: "POST",

              body:
                JSON.stringify({
                  username:
                    username,
                }),
            }
          );

          qs(
            "#friendUsername"
          ).value = "";

          qs(
            "#friendMessage"
          ).textContent =
            "Invite sent to " +
            username +
            ".";

          await refreshFriendState(
            true
          );
        } catch (error) {
          qs(
            "#friendMessage"
          ).textContent =
            error.message;
        } finally {
          state.busy = false;

          qs(
            "#sendFriendBtn"
          ).disabled = false;
        }
      }
    );

    on(
      "#createInviteLinkBtn",
      "click",
      createInviteLink
    );

    on(
      "#copyInviteLinkBtn",
      "click",
      copyInviteLink
    );

    on(
      "#shareInviteLinkBtn",
      "click",
      shareInviteLink
    );
  }

  async function createInviteLink() {
    if (state.busy) {
      return;
    }

    state.busy = true;

    var button = qs(
      "#createInviteLinkBtn"
    );

    button.disabled = true;

    qs(
      "#friendMessage"
    ).textContent = "";

    try {
      var data =
        await api(
          "/api/games/invite-link/create/",
          {
            method: "POST",
          }
        );

      qs(
        "#inviteLinkInput"
      ).value =
        data.invite_url;

      qs(
        "#inviteLinkRow"
      ).classList.remove(
        "hidden"
      );

      qs(
        "#friendMessage"
      ).textContent =
        "Invite link ready. Send it to one friend; it expires in 24 hours.";
    } catch (error) {
      qs(
        "#friendMessage"
      ).textContent =
        error.message;
    } finally {
      state.busy = false;
      button.disabled = false;
    }
  }

  async function copyInviteLink() {
    var input = qs(
      "#inviteLinkInput"
    );

    if (
      !input ||
      !input.value
    ) {
      return;
    }

    try {
      if (
        navigator.clipboard &&
        navigator.clipboard
          .writeText
      ) {
        await navigator.clipboard.writeText(
          input.value
        );
      } else {
        input.focus();
        input.select();

        document.execCommand(
          "copy"
        );
      }

      qs(
        "#friendMessage"
      ).textContent =
        "Invite link copied.";
    } catch (error) {
      input.focus();
      input.select();

      qs(
        "#friendMessage"
      ).textContent =
        "Copy the selected link manually.";
    }
  }

  async function shareInviteLink() {
    var input = qs(
      "#inviteLinkInput"
    );

    if (
      !input ||
      !input.value
    ) {
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title:
            "GameHub Bingo invite",

          text:
            "Join my GameHub Bingo match",

          url: input.value,
        });

        return;
      } catch (error) {
        if (
          error &&
          error.name ===
            "AbortError"
        ) {
          return;
        }
      }
    }

    await copyInviteLink();
  }

  async function claimInviteLink() {
    if (
      !state.pendingInviteToken ||
      !state.username
    ) {
      return false;
    }

    try {
      showGlobalNotice(
        "Joining friend Bingo match…",
        false
      );

      var game =
        await api(
          "/api/games/invite-link/claim/",
          {
            method: "POST",

            body:
              JSON.stringify({
                token:
                  state.pendingInviteToken,
              }),
          }
        );

      state.pendingInviteToken =
        "";

      clearInviteFromUrl();

      qs(
        "#inviteAuthHint"
      ).classList.add(
        "hidden"
      );

      showGlobalNotice(
        "Friend match joined successfully.",
        false
      );

      openGame(game);

      return true;
    } catch (error) {
      showGlobalNotice(
        error.message,
        true
      );

      return false;
    }
  }

  async function startGame(
    gameType
  ) {
    if (
      state.busy ||
      !gameType
    ) {
      return;
    }

    state.busy = true;

    setGameControlsDisabled(
      true
    );

    try {
      var game =
        await api(
          "/api/games/start/",
          {
            method: "POST",

            body:
              JSON.stringify({
                game_type:
                  gameType,
              }),
          }
        );

      openGame(game);
    } catch (error) {
      if (
        error.status === 401
      ) {
        setLoggedOut();
      } else {
        showGlobalNotice(
          error.message,
          true
        );
      }
    } finally {
      state.busy = false;

      setGameControlsDisabled(
        false
      );
    }
  }

  function openGame(game) {
    state.gameId = game.id;

    state.gameType =
      game.game_type;

    state.mode =
      game.mode ||
      "SOLO";

    rememberGame(game);

    qs(
      "#lobby"
    ).classList.add(
      "hidden"
    );

    qs(
      "#playArea"
    ).classList.remove(
      "hidden"
    );

    qs(
      "#backLobbyBtn"
    ).classList.remove(
      "hidden"
    );

    qs(
      "#friendPanel"
    ).classList.add(
      "hidden"
    );

    if (
      state.mode ===
      "FRIEND"
    ) {
      startMatchPolling();
    } else {
      stopMatchPolling();
    }

    renderGame(game);
  }

  async function restoreActiveGame() {
    var saved = null;

    try {
      saved =
        JSON.parse(
          sessionStorage.getItem(
            ACTIVE_GAME_KEY
          ) || "null"
        );
    } catch (error) {
      forgetGame();
      return;
    }

    if (
      !saved ||
      !saved.id
    ) {
      return;
    }

    var url =
      saved.mode ===
      "FRIEND"
        ? "/api/games/friend-match/" +
          saved.id +
          "/"
        : "/api/games/" +
          saved.id +
          "/";

    try {
      openGame(
        await api(url)
      );
    } catch (error) {
      if (
        error.status === 401
      ) {
        setLoggedOut();
      } else {
        forgetGame();
        showLobby();
      }
    }
  }

  function showLobby(refresh) {
    if (
      typeof refresh ===
      "undefined"
    ) {
      refresh = true;
    }

    stopMatchPolling();

    state.gameId = null;
    state.gameType = null;
    state.mode = null;

    qs(
      "#lobby"
    ).classList.remove(
      "hidden"
    );

    qs(
      "#playArea"
    ).classList.add(
      "hidden"
    );

    qs(
      "#backLobbyBtn"
    ).classList.add(
      "hidden"
    );

    qs(
      "#newGameBtn"
    ).classList.remove(
      "hidden"
    );

    qs(
      "#forfeitMatchBtn"
    ).classList.add(
      "hidden"
    );

    if (
      refresh &&
      state.username
    ) {
      refreshFriendState(
        true
      );
    }
  }

  function setGameControlsDisabled(
    disabled
  ) {
    qsa(
      "[data-start], #newGameBtn, #backLobbyBtn, #addFriendBtn"
    ).forEach(
      function (button) {
        button.disabled =
          disabled;
      }
    );
  }

  async function move(
    moveValue
  ) {
    if (
      !state.gameId ||
      state.busy
    ) {
      return;
    }

    state.busy = true;

    var url =
      state.mode ===
      "FRIEND"
        ? "/api/games/friend-match/" +
          state.gameId +
          "/move/"
        : "/api/games/" +
          state.gameId +
          "/move/";

    try {
      var game =
        await api(
          url,
          {
            method: "POST",

            body:
              JSON.stringify({
                move:
                  moveValue,
              }),
          }
        );

      rememberGame(game);

      renderGame(game);

      if (
        game.state.status ===
        "FINISHED"
      ) {
        stopMatchPolling();
      }
    } catch (error) {
      if (
        error.status === 401
      ) {
        setLoggedOut();
        return;
      }

      qs(
        "#gameMessage"
      ).textContent =
        error.message;
    } finally {
      state.busy = false;
    }
  }

  async function forfeitFriendMatch() {
    if (
      state.mode !==
        "FRIEND" ||
      !state.gameId ||
      state.busy
    ) {
      return;
    }

    if (
      !window.confirm(
        "Forfeit this match? Your opponent will win and the match will close."
      )
    ) {
      return;
    }

    state.busy = true;

    qs(
      "#forfeitMatchBtn"
    ).disabled = true;

    try {
      var game =
        await api(
          "/api/games/friend-match/" +
            state.gameId +
            "/forfeit/",
          {
            method: "POST",
          }
        );

      renderGame(game);

      stopMatchPolling();

      await refreshFriendState(
        true
      );
    } catch (error) {
      qs(
        "#gameMessage"
      ).textContent =
        error.message;
    } finally {
      state.busy = false;

      qs(
        "#forfeitMatchBtn"
      ).disabled = false;
    }
  }

  function renderGame(game) {
    state.gameId =
      game.id;

    state.gameType =
      game.game_type;

    state.mode =
      game.mode ||
      state.mode ||
      "SOLO";

    qs(
      "#gameMessage"
    ).textContent =
      game.state.message ||
      "";

    qs(
      "#newGameBtn"
    ).classList.toggle(
      "hidden",
      state.mode ===
        "FRIEND"
    );

    qs(
      "#forfeitMatchBtn"
    ).classList.toggle(
      "hidden",

      !(
        state.mode ===
          "FRIEND" &&
        game.state.status ===
          "ACTIVE"
      )
    );

    if (
      game.game_type ===
      "TIC_TAC_TOE"
    ) {
      renderTic(
        game.state
      );
    } else {
      renderBingo(
        game.state,

        game.game_type ===
          "BINGO_FRIEND"
      );
    }
  }

  function renderTic(gameState) {
    qs(
      "#gameTypeLabel"
    ).textContent =
      "3 × 3 CLASSIC";

    qs(
      "#gameTitle"
    ).textContent =
      "Tic-Tac-Toe";

    qs(
      "#ticArea"
    ).classList.remove(
      "hidden"
    );

    qs(
      "#bingoArea"
    ).classList.add(
      "hidden"
    );

    var board = qs(
      "#ticBoard"
    );

    board.innerHTML = "";

    gameState.board.forEach(
      function (
        value,
        index
      ) {
        var button =
          document.createElement(
            "button"
          );

        button.type =
          "button";

        button.className =
          "tic-cell " +
          (value
            ? value.toLowerCase()
            : "");

        button.textContent =
          value || "";

        /*
         * IMPORTANT:
         * state.busy intentionally
         * not used here.
         */
        button.disabled =
          Boolean(value) ||
          gameState.status !==
            "ACTIVE";

        button.setAttribute(
          "aria-label",

          value
            ? "Square " +
                (index + 1) +
                ": " +
                value

            : "Square " +
                (index + 1) +
                ": empty"
        );

        button.addEventListener(
          "click",
          function () {
            move(index);
          }
        );

        board.appendChild(
          button
        );
      }
    );
  }

  function renderBingo(
    gameState,
    friendMode
  ) {
    qs(
      "#gameTypeLabel"
    ).textContent =
      friendMode
        ? "PRIVATE 2 PLAYER"
        : "CPU BINGO";

    qs(
      "#gameTitle"
    ).textContent =
      friendMode
        ? "Bingo vs " +
          gameState.opponent_name
        : "Bingo vs Computer";

    qs(
      "#ticArea"
    ).classList.add(
      "hidden"
    );

    qs(
      "#bingoArea"
    ).classList.remove(
      "hidden"
    );

    qs(
      "#userLines"
    ).textContent =
      Math.min(
        gameState.my_lines ||
          0,
        5
      ) +
      " / 5";

    qs(
      "#opponentLabel"
    ).textContent =
      gameState.opponent_name ||
      "Opponent";

    qs(
      "#opponentLines"
    ).textContent =
      gameState.opponent_lines ==
      null
        ? "Hidden"

        : Math.min(
            gameState.opponent_lines,
            5
          ) +
          " / 5";

    var myCalls =
      new Set(
        gameState.my_calls ||
          []
      );

    var opponentCalls =
      new Set(
        gameState.opponent_calls ||
          []
      );

    var allCalled =
      new Set(
        gameState.all_called ||
          []
      );

    var completedIndexes =
      new Set();

    (
      gameState.completed_lines ||
      []
    ).forEach(
      function (line) {
        line.forEach(
          function (index) {
            completedIndexes.add(
              index
            );
          }
        );
      }
    );

    var board = qs(
      "#bingoBoard"
    );

    board.innerHTML = "";

    (
      gameState.board ||
      []
    ).forEach(
      function (
        number,
        index
      ) {
        var button =
          document.createElement(
            "button"
          );

        var mine =
          myCalls.has(
            number
          );

        var theirs =
          opponentCalls.has(
            number
          );

        var completed =
          completedIndexes.has(
            index
          );

        var classes = [
          "bingo-cell",
        ];

        if (mine) {
          classes.push(
            "call-own"
          );
        }

        if (theirs) {
          classes.push(
            "call-opponent"
          );
        }

        if (completed) {
          classes.push(
            "line-complete"
          );
        }

        button.type =
          "button";

        button.className =
          classes.join(" ");

        button.textContent =
          number;

        /*
         * IMPORTANT FIX:
         *
         * state.busy is NOT used here.
         *
         * Earlier board was rendered
         * while state.busy=true, which
         * permanently disabled every
         * number.
         */
        button.disabled =
          allCalled.has(
            number
          ) ||
          gameState.status !==
            "ACTIVE" ||
          !gameState.my_turn;

        button.setAttribute(
          "aria-label",

          mine
            ? "Number " +
                number +
                ", your call"

            : theirs
              ? "Number " +
                number +
                ", opponent call"

              : "Call number " +
                number
        );

        button.addEventListener(
          "click",
          function () {
            move(number);
          }
        );

        board.appendChild(
          button
        );
      }
    );

    if (
      gameState.last_call
    ) {
      qs(
        "#bingoCalls"
      ).textContent =
        gameState.last_call
          .owner ===
        "YOU"

          ? "Last call: " +
            gameState.last_call
              .number +
            " — yours (green)"

          : "Last call: " +
            gameState.last_call
              .number +
            " — " +
            gameState.opponent_name +
            " (red)";
    } else if (
      friendMode
    ) {
      qs(
        "#bingoCalls"
      ).textContent =
        gameState.my_turn

          ? "You start. Pick any number."

          : "Waiting for " +
            gameState.opponent_name +
            ".";
    } else {
      var calls =
        gameState.opponent_calls ||
        [];

      var last =
        calls.length
          ? calls[
              calls.length -
                1
            ]
          : null;

      qs(
        "#bingoCalls"
      ).textContent =
        last

          ? "Computer last called " +
            last +
            " (red). Your calls are green."

          : "Pick your first number. Your calls are green.";
    }
  }

  function emptyRow(text) {
    var row =
      document.createElement(
        "div"
      );

    row.className =
      "friend-empty";

    row.textContent =
      text;

    return row;
  }

  function renderFriendState(
    data
  ) {
    var incomingData =
      data.incoming ||
      [];

    var outgoingData =
      data.outgoing ||
      [];

    var matchesData =
      data.active_matches ||
      [];

    var incoming = qs(
      "#incomingRequests"
    );

    var outgoing = qs(
      "#outgoingRequests"
    );

    var matches = qs(
      "#activeMatches"
    );

    incoming.innerHTML = "";
    outgoing.innerHTML = "";
    matches.innerHTML = "";

    if (
      !incomingData.length
    ) {
      incoming.appendChild(
        emptyRow(
          "No incoming invites."
        )
      );
    }

    incomingData.forEach(
      function (item) {
        var row =
          document.createElement(
            "div"
          );

        row.className =
          "friend-row";

        var name =
          document.createElement(
            "span"
          );

        name.textContent =
          item.username;

        var actions =
          document.createElement(
            "div"
          );

        actions.className =
          "friend-row-actions";

        var accept =
          document.createElement(
            "button"
          );

        accept.type =
          "button";

        accept.className =
          "mini-action accept";

        accept.textContent =
          "Accept";

        accept.addEventListener(
          "click",
          function () {
            acceptFriendRequest(
              item.id
            );
          }
        );

        var decline =
          document.createElement(
            "button"
          );

        decline.type =
          "button";

        decline.className =
          "mini-action";

        decline.textContent =
          "Decline";

        decline.addEventListener(
          "click",
          function () {
            declineFriendRequest(
              item.id
            );
          }
        );

        actions.appendChild(
          accept
        );

        actions.appendChild(
          decline
        );

        row.appendChild(
          name
        );

        row.appendChild(
          actions
        );

        incoming.appendChild(
          row
        );
      }
    );

    if (
      !outgoingData.length
    ) {
      outgoing.appendChild(
        emptyRow(
          "No pending sent invites."
        )
      );
    }

    outgoingData.forEach(
      function (item) {
        var row =
          document.createElement(
            "div"
          );

        row.className =
          "friend-row";

        var name =
          document.createElement(
            "span"
          );

        name.textContent =
          item.username;

        var cancel =
          document.createElement(
            "button"
          );

        cancel.type =
          "button";

        cancel.className =
          "mini-action";

        cancel.textContent =
          "Cancel";

        cancel.addEventListener(
          "click",
          function () {
            cancelFriendRequest(
              item.id
            );
          }
        );

        row.appendChild(
          name
        );

        row.appendChild(
          cancel
        );

        outgoing.appendChild(
          row
        );
      }
    );

    if (
      !matchesData.length
    ) {
      matches.appendChild(
        emptyRow(
          "No active friend matches."
        )
      );
    }

    matchesData.forEach(
      function (item) {
        var row =
          document.createElement(
            "div"
          );

        row.className =
          "friend-row";

        var info =
          document.createElement(
            "div"
          );

        var name =
          document.createElement(
            "strong"
          );

        name.textContent =
          item.opponent_name;

        var turn =
          document.createElement(
            "small"
          );

        turn.textContent =
          item.my_turn
            ? "Your turn"
            : "Opponent turn";

        info.appendChild(
          name
        );

        info.appendChild(
          turn
        );

        var open =
          document.createElement(
            "button"
          );

        open.type =
          "button";

        open.className =
          "mini-action accept";

        open.textContent =
          "Open";

        open.addEventListener(
          "click",
          function () {
            openFriendMatch(
              item.id
            );
          }
        );

        row.appendChild(
          info
        );

        row.appendChild(
          open
        );

        matches.appendChild(
          row
        );
      }
    );
  }

  async function refreshFriendState(
    silent
  ) {
    if (!state.username) {
      return;
    }

    try {
      renderFriendState(
        await api(
          "/api/games/friends/state/"
        )
      );
    } catch (error) {
      if (
        error.status === 401
      ) {
        setLoggedOut();
      } else if (!silent) {
        qs(
          "#friendMessage"
        ).textContent =
          error.message;
      }
    }
  }

  function startFriendPolling() {
    stopFriendPolling();

    state.friendPollTimer =
      setInterval(
        function () {
          refreshFriendState(
            true
          );
        },
        2000
      );
  }

  async function acceptFriendRequest(
    requestId
  ) {
    if (state.busy) {
      return;
    }

    state.busy = true;

    try {
      var game =
        await api(
          "/api/games/friends/" +
            requestId +
            "/accept/",
          {
            method: "POST",
          }
        );

      openGame(game);

      await refreshFriendState(
        true
      );
    } catch (error) {
      qs(
        "#friendMessage"
      ).textContent =
        error.message;
    } finally {
      state.busy = false;
    }
  }

  async function declineFriendRequest(
    requestId
  ) {
    if (state.busy) {
      return;
    }

    state.busy = true;

    try {
      await api(
        "/api/games/friends/" +
          requestId +
          "/decline/",
        {
          method: "POST",
        }
      );

      await refreshFriendState(
        true
      );
    } catch (error) {
      qs(
        "#friendMessage"
      ).textContent =
        error.message;
    } finally {
      state.busy = false;
    }
  }

  async function cancelFriendRequest(
    requestId
  ) {
    if (state.busy) {
      return;
    }

    state.busy = true;

    try {
      await api(
        "/api/games/friends/" +
          requestId +
          "/cancel/",
        {
          method: "POST",
        }
      );

      await refreshFriendState(
        true
      );
    } catch (error) {
      qs(
        "#friendMessage"
      ).textContent =
        error.message;
    } finally {
      state.busy = false;
    }
  }

  async function openFriendMatch(
    matchId
  ) {
    if (state.busy) {
      return;
    }

    state.busy = true;

    try {
      openGame(
        await api(
          "/api/games/friend-match/" +
            matchId +
            "/"
        )
      );
    } catch (error) {
      qs(
        "#friendMessage"
      ).textContent =
        error.message;
    } finally {
      state.busy = false;
    }
  }

  function startMatchPolling() {
    stopMatchPolling();

    state.matchPollTimer =
      setInterval(
        async function () {
          if (
            state.mode !==
              "FRIEND" ||
            !state.gameId ||
            state.busy
          ) {
            return;
          }

          try {
            var game =
              await api(
                "/api/games/friend-match/" +
                  state.gameId +
                  "/"
              );

            renderGame(
              game
            );

            if (
              game.state.status ===
              "FINISHED"
            ) {
              stopMatchPolling();
            }
          } catch (error) {
            if (
              error.status ===
              401
            ) {
              setLoggedOut();
            }
          }
        },
        1000
      );
  }

  function init() {
    state.pendingInviteToken =
      readInviteToken();

    if (
      state.pendingInviteToken
    ) {
      qs(
        "#inviteAuthHint"
      ).classList.remove(
        "hidden"
      );

      showGlobalNotice(
        "Friend Bingo invitation detected.",
        false
      );
    }

    setupEventHandlers();

    bootstrap();
  }

  if (
    document.readyState ===
    "loading"
  ) {
    document.addEventListener(
      "DOMContentLoaded",
      init
    );
  } else {
    init();
  }
})();