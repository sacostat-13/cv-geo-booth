/* Every number the booth runs on, in one place, with the reason it has that
   value. config.js (written at build time from environment variables)
   overrides any of it; nothing here needs editing to run the booth.

   Load order on every page: defaults.js, then config.js, then the rest. */
(function () {
  const DEFAULTS = {
    // local | netlify | supabase — set by tools/build-config.js
    mode: 'local',

    event: {
      name: 'MozFest 2026',
      booth: 'Common Voice',
      slug: 'mozfest-2026',
      // The swag goes to the top three of the day, so the day board must not
      // carry yesterday's rehearsal into the morning.
      resetDaily: true
    },

    run: {
      // Five questions. At roughly 15s each that is a 75-90s turn, which is
      // where trade-show operators put anything with a queue behind it, and
      // it leaves room for two pads to serve ~80 people an hour.
      questions: 5,
      // 20s to answer. Long enough to listen twice and think; short enough
      // that a stalled player does not hold the pad.
      answerMs: 20000,
      // How long the right answer sits on the pad before the next question.
      // Immediate correction is the whole reason the quiz teaches anything.
      revealMs: 3500,
      // Clips are cut to this on the way in; the player may replay twice.
      // Past about six seconds a listener who does not know the language
      // gains very little, and every extra second comes out of the queue.
      clipSecs: 6,
      replays: 2,
      // 100 for knowing it, up to 50 for being quick. Knowledge has to
      // outweigh speed or the booth rewards reflexes instead of ears.
      pointsCorrect: 100,
      pointsSpeedMax: 50,
      // The first two questions come from languages most people have heard.
      // Nobody should walk away from a Common Voice booth having scored zero.
      easyFirst: 2
    },

    duel: {
      // Both pads choosing the same mode within this window become a duel.
      windowMs: 3500,
      // Then a shared countdown, so the first question lands on both pads at
      // the same instant. Any visible gap reads as cheating.
      readyMs: 5000
    },

    screen: {
      // The screen is the only thing polling continuously. 1s while someone
      // is playing, 3s when nobody is: fast enough to look live, slow enough
      // to stay inside a free Netlify plan over a three-day festival.
      pollMs: 1000,
      idlePollMs: 3000,
      // How long a revealed language holds the right-hand panel.
      revealMs: 12000,
      // With nothing happening the screen alternates: the board, then a fact
      // about Common Voice itself.
      idleCardMs: 9000,
      // The headline board is the last hour, so a morning hero cannot sit on
      // it until closing. The day board, which is the one with swag attached,
      // sits underneath it and is deliberately smaller.
      hourTop: 10,
      dayTop: 3
    },

    // Where the QR code beside a revealed language points. {locale} is
    // replaced with the Common Voice locale code.
    languageUrl: 'https://commonvoice.mozilla.org/{locale}/datasets',
    contributeUrl: 'https://commonvoice.mozilla.org/{locale}/speak'
  };

  function merge(base, over) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    for (const k in over) {
      if (over[k] && typeof over[k] === 'object' && !Array.isArray(over[k]) && typeof base[k] === 'object') {
        out[k] = merge(base[k], over[k]);
      } else if (over[k] !== undefined) {
        out[k] = over[k];
      }
    }
    return out;
  }

  window.BOOTH = DEFAULTS;
  window.BOOTH_CONFIGURE = function (cfg) {
    window.BOOTH = merge(DEFAULTS, cfg || {});
  };
})();
