## ProVerlay

[ProVerlay](https://github.com/Ferrywell/ProVerlay) is open-source live broadcast graphics software for OBS and vMix
(scoreboards, lower thirds, tickers, countdowns, quizzes). This module controls ProVerlay from Companion.

### Setup

1. Start ProVerlay (the Mac app, or `npm start` in the ProVerlay folder). It listens on port **2014**.
2. Add a **ProVerlay** connection in Companion and enter:

| Field | Default   | Description                                                  |
| ----- | --------- | ------------------------------------------------------------ |
| Host  | 127.0.0.1 | IP address or LAN host name of the machine running ProVerlay |
| Port  | 2014      | ProVerlay server port                                        |

The connection turns green as soon as the state of the active project has been received. When ProVerlay restarts,
the module reconnects by itself (with increasing intervals up to 30 seconds).

ProVerlay has no authentication: use it on a trusted network only. Use an IP address or a local host name
(`studio-pc`, `*.local`); ProVerlay refuses unknown public host names.

### Actions

Graphics, speakers, questions and ticker messages are picked from dropdowns that follow the active project. A new
graphic, a renamed graphic or switching projects updates the dropdowns and presets automatically.

| Action                                         | Options                                                         | What it does                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Graphic: show / hide / toggle (combined)       | Graphic, Mode                                                   | Puts a graphic on or off the combined `/render` output                                        |
| Graphic: show / hide / toggle (solo)           | Graphic, Mode                                                   | Puts a graphic on or off its own `/render?graphic=<id>` output                                |
| Widget: next                                   | Widget, Wrap around                                             | Next speaker, image or quiz step (question, answer, next question); puts the widget on air    |
| Widget: previous                               | Widget, Wrap around                                             | The same, one step back                                                                       |
| Widget: run action                             | Action, Payload                                                 | Runs an action the widget offers, such as _Quiz: Reveal answer_ (Payload: e.g. a number)      |
| Score: +1 / −1 / set                           | Scoreboard, Team, Change (add, subtract, set to), Amount        | Match scoreboard or hockey scorebug. Every press counts, even several presses in a row        |
| Clock: start / pause / toggle / reset / adjust | Scoreboard, Action, Seconds (adjust), Time mm:ss (set)          | Start never resets a running clock. Reset: match → 00:00, hockey → full quarter               |
| Match: set period                              | Match scoreboard, Period                                        | 1st half, 2nd half, extra time 1 / 2                                                          |
| Hockey: next / previous / set period           | Hockey scorebug, Mode, Period, Step through breaks, Reset clock | Q1–Q4 and break. A running clock is paused before a break                                     |
| Ticker: enable / disable / toggle a message    | Message, Mode                                                   | Switches one ticker message on or off; other messages are left alone                          |
| Ticker: add message                            | Ticker, Text, Enable immediately                                | Adds a message to the end of the ticker (variables allowed in the text)                       |
| Countdown: start (duration from now)           | Countdown, Minutes, Seconds                                     | Sets the countdown target to now + duration                                                   |
| Countdown: stop (jump to 0:00)                 | Countdown                                                       | Sets the target to now. With "hide when expired" the countdown disappears                     |
| Countdown: set target time                     | Countdown, Target                                               | `HH:MM`, `HH:MM:SS` (next occurrence, Companion's time zone) or an ISO date-time              |
| Lower thirds: show speaker                     | Speaker                                                         | Puts one speaker of a lower-thirds roster on air                                              |
| Lower thirds: next / previous speaker          | Roster, Direction, Wrap around                                  | Shows the next / previous speaker of the roster                                               |
| Lower thirds: hide                             | Roster                                                          | Takes the roster's lower third off air                                                        |
| Quiz: show question                            | Question                                                        | Puts the question on air with the answer hidden                                               |
| Quiz: reveal / hide / toggle answer            | Quiz, Mode                                                      | Highlights the correct answer                                                                 |
| Quiz: hide                                     | Quiz                                                            | Takes the quiz off air                                                                        |
| Message: set text (and show)                   | Message graphic, Text, Show                                     | Changes the text of a message graphic and optionally shows it (variables allowed in the text) |
| Brand: set primary colour                      | Colour                                                          | Sets the project's primary brand colour                                                       |

### Feedbacks

| Feedback                         | True when                                                 |
| -------------------------------- | --------------------------------------------------------- |
| Graphic on air (combined output) | The graphic is visible on `/render` (red ON AIR style)    |
| Graphic on air (solo output)     | The graphic is visible on its solo output                 |
| Clock running (match + hockey)   | The scoreboard clock is running                           |
| Lower thirds: speaker on air     | This speaker is the active entry and the roster is on air |
| Quiz: question on air            | This question is active and the quiz is on air            |
| Quiz: answer revealed            | The correct answer is highlighted                         |
| Ticker: message enabled          | The ticker message is enabled                             |

### Variables

`<id>` is the graphic id with `-` replaced by `_` (for example `match_scoreboard_3f9a1c2e`); the variable list in
Companion shows the graphic name next to every variable.

| Variable                                     | Value                                                                   |
| -------------------------------------------- | ----------------------------------------------------------------------- |
| `project_name`, `project_id`                 | Active project                                                          |
| `graphic_count`, `visible_count`             | Number of graphics / graphics on the combined output                    |
| `name_<id>`                                  | Graphic name                                                            |
| `onair_<id>`, `solo_<id>`                    | true / false                                                            |
| `code_<id>_home`, `code_<id>_away`           | Team codes (match and hockey)                                           |
| `score_<id>_home`, `score_<id>_away`         | Scores                                                                  |
| `clock_<id>`                                 | Clock as shown on air (`12:34`, `45+2:13`, `—:—` during a hockey break) |
| `clock_<id>_running`                         | true / false                                                            |
| `period_<id>`                                | Period (`1st half`, `Q2`, `RUST` during a hockey break)                 |
| `countdown_<id>`                             | Countdown remaining time                                                |
| `ticker_<id>_current`, `ticker_<id>_enabled` | Enabled ticker messages joined with `•`, and how many are enabled       |
| `speaker_<id>_name`, `speaker_<id>_title`    | Active speaker of a lower-thirds roster                                 |
| `quiz_<id>_question`, `quiz_<id>_revealed`   | Active quiz question, answer revealed                                   |
| `message_<id>`                               | Text of a message graphic                                               |

Clocks and countdowns are calculated in the module every quarter second from the clock data ProVerlay sends, so
they tick without extra network traffic.

### Presets

The preset browser has a section per widget type and a group per graphic: on-air and solo toggles, score buttons that
show the team code and score, a clock button that shows the running time and turns green while it runs, clock
nudges, period buttons, ticker message toggles, countdown start/stop buttons, a button per speaker and per quiz
question, and next/previous/hide buttons.
