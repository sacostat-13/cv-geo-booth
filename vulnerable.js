/* Languages the booth wants people to know about, whether or not anyone in the
   room speaks them. The screen shows one at a time, as a caption under the
   wall, only while it is resting between arrivals.

   WHY THIS FILE IS EMPTY
   ----------------------
   Every line here goes on a 42" screen at a Mozilla event with a language's
   name on it. A wrong speaker count, or a language described as dying that its
   community is actively teaching, is worse than showing nothing — so nothing
   is shipped unreviewed. Fill it from sources you can cite and have someone on
   Common Voice read it before the festival. The caption simply does not appear
   while this list is empty.

   WHAT TO PUT IN IT
   -----------------
   Endangerment is about transmission, not headcount: a language with 50,000
   speakers and no children learning it is in worse shape than one with 800
   that every child speaks. So lead with the status, not the number.
     - status  from Glottolog's AES or the Catalogue of Endangered Languages
               (endangeredlanguages.com), both citable and open. Ethnologue's
               figures are licensed — do not copy them in.
     - action  what is being done, by whom. Every entry ends somewhere other
               than despair; a wall of dying languages with no verbs is a
               guilt trip, not an invitation.
     - ask     what someone standing at the booth can do about it. Leave it
               out and the default below is used.
     - source  where the figures came from, so the next person can check them.

   One entry, as it would look:

     { name:    'Maleku',
       where:   'Costa Rica',
       status:  'severely endangered',
       speakers: 750,            // omit entirely rather than guess
       action:  'taught in the community schools of Guatuso',
       cv:      'not in Common Voice',
       source:  'ELCat / Glottolog AES, checked 2026-10' },

   Thirty to sixty of these is plenty for a three-day festival — the screen
   shows one per rest period and never twice in a row. */
window.VULNERABLE = {
  // Shown under the last entry's line, unless an entry sets its own `ask`.
  ask: 'Languages get added to Common Voice because someone asks.',
  entries: [],
};
