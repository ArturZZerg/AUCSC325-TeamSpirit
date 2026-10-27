# CampusFlow store listing (draft)

Status: **draft for owner review**. Text and screenshots describe implemented
behavior only. Privacy declarations, support/privacy URLs, age rating answers
and the review account must be confirmed by the owner before submission (see
the [production readiness record](../development/production-readiness.md)).

## Identity

| Field | Value |
| --- | --- |
| App name (≤30) | CampusFlow |
| Subtitle (≤30) | Student planner & daily flow |
| Category | Education (secondary: Productivity) |
| Bundle / package | `com.campusflow.mobile` |

## Promotional text (≤170)

Your classes, deadlines, exams, routines and campus events in one calm daily
plan, with grade targets, task steps and a focus timer.

## Description

CampusFlow brings a student's day into one place.

- **Today, at a glance.** A daily plan that combines tasks, coursework deadlines,
  routines and saved campus events, with your progress, an exam countdown and a
  quick-add bar that understands "Essay due fri 5pm #uni !high".
- **Tasks that fit real work.** Group tasks by when they're due, break them into
  steps, set reminders and pick one Main Goal for the day.
- **Courses and grades.** Add your courses with colours, record weighted
  assessments or groups like "Quizzes 20%", and see what you need on the rest of
  the term to reach your target. Try "what if" scores before an exam.
- **Exams and coursework.** Track assignments, quizzes and exams, and plan revision
  sessions that end the day before an exam.
- **A month and a week ahead.** A calendar coloured by course and a weekly planner
  that finds study time around your classes.
- **Focus.** A study timer that keeps your progress if the app closes and records
  your study time.
- **Routines and wellbeing.** Gentle daily or weekly routines with streaks, a
  check-in journal and a breathing pause. Not a medical app.
- **Campus life.** Browse and save events from supported campus calendars.
- **Works offline for reading.** Your last saved plan stays available without a
  connection. Dark mode follows your phone.
- **Accessible.** Works with VoiceOver and TalkBack, follows your text size,
  meets WCAG AA contrast and respects Reduce Motion.

Connect Canvas with your own access token to bring in courses, assignments,
scores, planner to-dos and course calendar events. CampusFlow is a student
project, not endorsed by Instructure or your school; read the in-app notice
before connecting. Without Canvas you can add your own courses and coursework.

## Keywords (≤100 characters)

`student,planner,homework,assignments,exams,grades,study,timetable,campus,focus`

## Screenshots

`docs/store/screenshots/` holds seven 1290×2796 JPEGs (6.7" iPhone) captured
from the web build against a local API with demo data:

1. Today — "Your whole day, in one calm plan"
2. Tasks with steps — "Break big work into small steps"
3. Course grades — "Know what you need on the final"
4. Month calendar — "See the whole month ahead"
5. Habits — "Build routines that stick"
6. Focus — "Focus on one thing at a time"
7. Dark mode — "Easy on the eyes, day or night"

Before submission, regenerate them from a native release build on a simulator
or device with a curated demo account (status bar, realistic names, a full day of
progress), and add the iPad/Android sizes the stores require.

## Owner review checklist

- [ ] Privacy policy and support URLs published and configured (Help & data).
- [ ] App Privacy / Data safety answers match the data model: account email and
      name; tasks, coursework, courses, grades, routines, journal entries and focus
      history stored on the CampusFlow server; no third-party advertising/tracking.
- [ ] Age rating questionnaire.
- [ ] Review account credentials (preview registration is closed in production).
- [ ] Final screenshots from a native release build.
