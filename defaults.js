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

      /* Difficulty. Visitors told us the quiz was hardest when the four
         options were all relatives of each other, so that is now a choice
         rather than the only setting. What a level changes is how close the
         three wrong answers are to the right one — which is the whole
         difficulty of a guess-the-language question — and what a right
         answer is worth.

         `related` is how many of the three wrong options come from the same
         language family as the answer. The multipliers are Simon's: one
         right answer on Hard is worth five on Easy, one on Normal is worth
         two. They multiply the whole score for the question, speed bonus
         included, so being quick is worth more where the question is
         harder. */
      level: 'normal',
      levels: {
        easy: {
          // relatedOptional: a language with no relatives still plays Easy.
          key: 'easy', name: 'Easy', multiplier: 1, related: 1, relatedOptional: true, prominent: 2, perfect: false,
          note: 'Two famous languages and one relative of the right one.',
          expect: 'Two names everyone knows and one close cousin.',
          points: 'Base points'
        },
        normal: {
          key: 'normal', name: 'Normal', multiplier: 2, related: 1, perfect: true,
          note: 'One wrong answer is a relative of the right one.',
          expect: 'One option is a close cousin. The other two are not.',
          points: 'Double points'
        },
        hard: {
          key: 'hard', name: 'Hard', multiplier: 5, related: 3, perfect: true,
          note: 'All four are from the same family.',
          expect: 'Four relatives. Nothing but the language itself gives it away.',
          points: 'Five times the points'
        }
      },
      /* All five right, on a level where the wrong answers were relatives.
         Worth two more correct answers at that level — 400 on Normal,
         1,000 on Hard — which is about a third on top of a perfect run:
         enough to be worth going up a level for, not so much that one lucky
         run settles the day board. Easy has no perfect run; the bonus is
         meant to be a reason to leave Easy. */
      perfectBonus: 2,
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
      // How long a revealed language holds the right-hand panel when nobody
      // is mid-run. While somebody is still playing it holds until their next
      // answer replaces it, however long they take to think.
      revealMs: 12000,
      // How long since a pad's last word before the screen stops counting it
      // as live. It has to clear a whole question — 20s to answer, 3.5s of
      // reveal — plus room for a slow player, or the screen drops someone who
      // is only thinking.
      padLiveMs: 40000,
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
    contributeUrl: 'https://commonvoice.mozilla.org/{locale}/speak',
    // Where the "play on your phone" QR points, relative to the site. Not /c,
    // which is a Netlify redirect and 404s on a local static server.
    playUrl: '/pad.html?station=C'
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
