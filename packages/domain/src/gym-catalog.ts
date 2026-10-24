/** Built-in exercise library and training programs. Static product content, never stored per account (ADR 020). */
export type GymLevel = 'beginner' | 'intermediate' | 'advanced';
/** Programs are written for an emphasis; every student can follow any program. */
export type GymAudience = 'everyone' | 'women' | 'men';
export type GymGoal = 'strength' | 'muscle' | 'toning' | 'fitness';
export type GymSetting = 'gym' | 'dumbbells' | 'none';
export type Muscle = 'chest' | 'back' | 'traps' | 'shoulders' | 'biceps' | 'triceps' | 'forearms' | 'quads' | 'hamstrings' | 'glutes' | 'adductors' | 'calves' | 'core';
export const muscles: readonly Muscle[] = ['chest', 'back', 'traps', 'shoulders', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'core'];
export type Equipment = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight' | 'kettlebell' | 'band' | 'other';
/** external: the lifted weight; added: optional load on top of bodyweight; bodyweight: reps only. */
export type LoadKind = 'external' | 'added' | 'bodyweight';
/** `mediaId` points into the exercise library (photos and instructions, ADR 022). */
export interface GymExercise { id: string; name: string; muscles: readonly Muscle[]; equipment: Equipment; load: LoadKind; cue: string; perSide?: boolean; mediaId?: string }
export interface PrescribedExercise { exerciseId: string; sets: number; repMin: number; repMax: number; restSeconds: number; note?: string | null }
/** Archived days keep history readable but are skipped by the rotation. */
export interface ProgramDay { id: string; name: string; focus: string; exercises: readonly PrescribedExercise[]; archived?: boolean }
/** What the training rules need from a program: built-in or the student's own. */
export interface TrainingProgram { id: string; name: string; days: readonly ProgramDay[] }
export interface GymProgram extends TrainingProgram {
  id: string; name: string; tagline: string; description: string; levels: readonly GymLevel[]; audience: GymAudience;
  goal: GymGoal; setting: GymSetting; daysPerWeek: number; schedule: string; tips: readonly string[]; days: readonly ProgramDay[];
}

const media: Record<string, string> = {
  'back-squat': 'Barbell_Full_Squat', 'goblet-squat': 'Goblet_Squat', 'bodyweight-squat': 'Bodyweight_Squat', 'leg-press': 'Leg_Press',
  'romanian-deadlift': 'Romanian_Deadlift', 'db-romanian-deadlift': 'Stiff-Legged_Dumbbell_Deadlift', deadlift: 'Barbell_Deadlift',
  'hip-thrust': 'Barbell_Hip_Thrust', 'glute-bridge': 'Butt_Lift_Bridge', 'single-leg-glute-bridge': 'Single_Leg_Glute_Bridge',
  'bulgarian-split-squat': 'Split_Squat_with_Dumbbells', 'walking-lunge': 'Dumbbell_Lunges', 'reverse-lunge': 'Dumbbell_Rear_Lunge',
  'step-up': 'Dumbbell_Step_Ups', 'leg-curl': 'Lying_Leg_Curls', 'leg-extension': 'Leg_Extensions', 'hip-abduction': 'Thigh_Abductor',
  'cable-kickback': 'One-Legged_Cable_Kickback', 'back-extension': 'Hyperextensions_Back_Extensions', 'calf-raise': 'Standing_Calf_Raises',
  'bench-press': 'Barbell_Bench_Press_-_Medium_Grip', 'db-bench-press': 'Dumbbell_Bench_Press', 'incline-db-press': 'Incline_Dumbbell_Press',
  'push-up': 'Pushups', 'incline-push-up': 'Incline_Push-Up', 'overhead-press': 'Standing_Military_Press', 'db-shoulder-press': 'Dumbbell_Shoulder_Press',
  'lateral-raise': 'Side_Lateral_Raise', 'cable-fly': 'Cable_Crossover', dips: 'Dips_-_Chest_Version', 'bench-dip': 'Bench_Dips',
  'triceps-pushdown': 'Triceps_Pushdown', 'overhead-triceps-extension': 'Standing_Dumbbell_Triceps_Extension', 'pull-up': 'Pullups',
  'lat-pulldown': 'Wide-Grip_Lat_Pulldown', 'seated-cable-row': 'Seated_Cable_Rows', 'barbell-row': 'Bent_Over_Barbell_Row',
  'one-arm-db-row': 'One-Arm_Dumbbell_Row', 'chest-supported-row': 'Dumbbell_Incline_Row', 'inverted-row': 'Inverted_Row', 'face-pull': 'Face_Pull',
  'rear-delt-fly': 'Reverse_Flyes', 'db-curl': 'Dumbbell_Bicep_Curl', 'incline-db-curl': 'Incline_Dumbbell_Curl', 'hammer-curl': 'Hammer_Curls',
  'dead-bug': 'Dead_Bug', crunch: 'Crunches', 'hanging-knee-raise': 'Hanging_Leg_Raise', 'cable-crunch': 'Cable_Crunch',
};
const x = (id: string, name: string, equipment: Equipment, load: LoadKind, muscles: Muscle[], cue: string, perSide = false): GymExercise =>
  ({ id, name, equipment, load, muscles, cue, ...(perSide ? { perSide } : {}), ...(media[id] ? { mediaId: media[id] } : {}) });
export const gymExercises: readonly GymExercise[] = [
  x('back-squat', 'Barbell back squat', 'barbell', 'external', ['quads', 'glutes'], 'Brace your core, sit between your hips and keep your knees tracking over your toes.'),
  x('goblet-squat', 'Goblet squat', 'dumbbell', 'external', ['quads', 'glutes'], 'Hold one dumbbell at your chest and sit straight down with a tall chest.'),
  x('bodyweight-squat', 'Bodyweight squat', 'bodyweight', 'bodyweight', ['quads', 'glutes'], 'Reach your arms forward, sit back and down, then stand tall.'),
  x('leg-press', 'Leg press', 'machine', 'external', ['quads', 'glutes'], 'Lower the platform as deep as your hips stay on the seat; never lock your knees hard.'),
  x('romanian-deadlift', 'Romanian deadlift', 'barbell', 'external', ['hamstrings', 'glutes'], 'Push your hips back with soft knees and a flat back until you feel a hamstring stretch.'),
  x('db-romanian-deadlift', 'Dumbbell Romanian deadlift', 'dumbbell', 'external', ['hamstrings', 'glutes'], 'Slide the dumbbells down your thighs by pushing your hips back; keep your back flat.'),
  x('deadlift', 'Deadlift', 'barbell', 'external', ['hamstrings', 'glutes', 'back'], 'Bar over mid-foot, brace, push the floor away and keep the bar close to your legs.'),
  x('hip-thrust', 'Barbell hip thrust', 'barbell', 'external', ['glutes'], 'Upper back on the bench, chin tucked; drive through your heels and squeeze at the top.'),
  x('glute-bridge', 'Glute bridge', 'bodyweight', 'bodyweight', ['glutes', 'hamstrings'], 'Lie on your back, feet flat, and lift your hips until knees, hips and shoulders line up.'),
  x('single-leg-glute-bridge', 'Single-leg glute bridge', 'bodyweight', 'bodyweight', ['glutes', 'hamstrings'], 'Keep your hips level as you lift; pause for a second at the top.', true),
  x('bulgarian-split-squat', 'Bulgarian split squat', 'dumbbell', 'external', ['quads', 'glutes'], 'Back foot on a bench, lower straight down and keep most of your weight on the front foot.', true),
  x('walking-lunge', 'Dumbbell walking lunge', 'dumbbell', 'external', ['quads', 'glutes'], 'Take a long step, lower your back knee toward the floor and push through the front heel.', true),
  x('reverse-lunge', 'Reverse lunge', 'bodyweight', 'bodyweight', ['quads', 'glutes'], 'Step back, lower under control and drive up through your front foot.', true),
  x('step-up', 'Dumbbell step-up', 'dumbbell', 'external', ['quads', 'glutes'], 'Use a knee-height box; step up with the working leg without pushing off the back foot.', true),
  x('leg-curl', 'Leg curl', 'machine', 'external', ['hamstrings'], 'Curl smoothly, pause briefly and lower slowly; keep your hips down on the pad.'),
  x('leg-extension', 'Leg extension', 'machine', 'external', ['quads'], 'Straighten your legs under control, squeeze for a moment and lower slowly.'),
  x('hip-abduction', 'Hip abduction machine', 'machine', 'external', ['glutes'], 'Sit tall or lean slightly forward and push your knees out against the pads without jerking.'),
  x('cable-kickback', 'Cable glute kickback', 'cable', 'external', ['glutes'], 'Hinge slightly, kick the leg back without arching your lower back and squeeze your glute.', true),
  x('back-extension', 'Glute-focused back extension', 'bodyweight', 'added', ['glutes', 'hamstrings'], 'Round your upper back slightly and lift with your glutes until your body is in a straight line.'),
  x('calf-raise', 'Standing calf raise', 'machine', 'external', ['calves'], 'Lower to a full stretch, pause, then rise as high as you can.'),
  x('bench-press', 'Barbell bench press', 'barbell', 'external', ['chest', 'triceps', 'shoulders'], 'Shoulder blades pinched, feet planted; lower the bar to mid-chest under control.'),
  x('db-bench-press', 'Dumbbell bench press', 'dumbbell', 'external', ['chest', 'triceps', 'shoulders'], 'Lower the dumbbells beside your chest with elbows about 45° from your body.'),
  x('incline-db-press', 'Incline dumbbell press', 'dumbbell', 'external', ['chest', 'shoulders', 'triceps'], 'Set the bench to about 30° and press up and slightly together.'),
  x('push-up', 'Push-up', 'bodyweight', 'bodyweight', ['chest', 'triceps', 'shoulders'], 'Body in one straight line; lower your chest to just above the floor.'),
  x('incline-push-up', 'Incline push-up', 'bodyweight', 'bodyweight', ['chest', 'triceps', 'shoulders'], 'Hands on a bench, desk or bed frame; the higher the hands, the easier the rep.'),
  x('overhead-press', 'Standing overhead press', 'barbell', 'external', ['shoulders', 'triceps'], 'Squeeze your glutes, press the bar straight up and move your head through at the top.'),
  x('db-shoulder-press', 'Seated dumbbell shoulder press', 'dumbbell', 'external', ['shoulders', 'triceps'], 'Back against the bench; press from shoulder height without arching your lower back.'),
  x('lateral-raise', 'Dumbbell lateral raise', 'dumbbell', 'external', ['shoulders'], 'Raise your arms out to the sides to shoulder height, leading with your elbows.'),
  x('cable-fly', 'Cable fly', 'cable', 'external', ['chest'], 'Slight bend in the elbows; bring your hands together in a wide hugging arc.'),
  x('dips', 'Dips', 'bodyweight', 'added', ['chest', 'triceps', 'shoulders'], 'Lean slightly forward and lower until your shoulders are just below your elbows.'),
  x('bench-dip', 'Bench dip', 'bodyweight', 'bodyweight', ['triceps', 'chest'], 'Hands on a sturdy chair or bench behind you; lower until your elbows reach about 90°.'),
  x('triceps-pushdown', 'Cable triceps pushdown', 'cable', 'external', ['triceps'], 'Pin your elbows to your sides and straighten your arms fully.'),
  x('overhead-triceps-extension', 'Overhead triceps extension', 'dumbbell', 'external', ['triceps'], 'Hold one dumbbell overhead with both hands; lower behind your head with elbows pointing up.'),
  x('pull-up', 'Pull-up', 'bodyweight', 'added', ['back', 'biceps'], 'Start from a dead hang and pull your chest toward the bar without swinging.'),
  x('lat-pulldown', 'Lat pulldown', 'cable', 'external', ['back', 'biceps'], 'Pull the bar to your upper chest, driving your elbows down toward your ribs.'),
  x('seated-cable-row', 'Seated cable row', 'cable', 'external', ['back', 'biceps'], 'Sit tall and pull the handle to your stomach; do not rock your torso.'),
  x('barbell-row', 'Barbell row', 'barbell', 'external', ['back', 'biceps'], 'Hinge to about 45°, keep your back flat and pull the bar to your lower ribs.'),
  x('one-arm-db-row', 'One-arm dumbbell row', 'dumbbell', 'external', ['back', 'biceps'], 'Hand and knee on a bench; pull the dumbbell toward your hip.', true),
  x('chest-supported-row', 'Chest-supported dumbbell row', 'dumbbell', 'external', ['back', 'biceps'], 'Lie chest-down on an incline bench and row both dumbbells toward your hips.'),
  x('inverted-row', 'Inverted row', 'bodyweight', 'bodyweight', ['back', 'biceps'], 'Under a sturdy table or low bar, keep your body straight and pull your chest up.'),
  x('face-pull', 'Cable face pull', 'cable', 'external', ['shoulders', 'back'], 'Rope at face height; pull toward your eyes and spread the rope apart.'),
  x('rear-delt-fly', 'Dumbbell rear-delt fly', 'dumbbell', 'external', ['shoulders', 'back'], 'Hinge forward and raise light dumbbells out to the sides without shrugging.'),
  x('db-curl', 'Dumbbell biceps curl', 'dumbbell', 'external', ['biceps'], 'Keep your elbows by your sides and lower the dumbbells slowly.'),
  x('incline-db-curl', 'Incline dumbbell curl', 'dumbbell', 'external', ['biceps'], 'Lean back on an incline bench and let your arms hang before each curl.'),
  x('hammer-curl', 'Hammer curl', 'dumbbell', 'external', ['biceps'], 'Palms facing each other; curl without swinging your body.'),
  x('dead-bug', 'Dead bug', 'bodyweight', 'bodyweight', ['core'], 'Press your lower back into the floor while extending the opposite arm and leg.', true),
  x('crunch', 'Crunch', 'bodyweight', 'bodyweight', ['core'], 'Curl your ribs toward your hips; do not pull on your neck.'),
  x('hanging-knee-raise', 'Hanging knee raise', 'bodyweight', 'bodyweight', ['core'], 'Hang from a bar and lift your knees toward your chest without swinging.'),
  x('cable-crunch', 'Cable crunch', 'cable', 'external', ['core'], 'Kneel facing the cable and crunch your ribs toward your hips.'),
];

const p = (exerciseId: string, sets: number, repMin: number, repMax: number, restSeconds = 90): PrescribedExercise => ({ exerciseId, sets, repMin, repMax, restSeconds });
const day = (id: string, name: string, focus: string, exercises: PrescribedExercise[]): ProgramDay => ({ id, name, focus, exercises });
const always = ['Leave 1–2 reps in reserve on most sets; form first, then weight.', 'Warm up with one or two light sets before the first exercise.'];

export const gymPrograms: readonly GymProgram[] = [
  { id: 'full-body-foundations', name: 'Full-Body Foundations', tagline: 'The classic first program: three short gym visits a week.',
    description: 'Two alternating full-body workouts that teach the main movement patterns. Each week you repeat the same lifts, so small improvements are easy to see.',
    levels: ['beginner'], audience: 'everyone', goal: 'fitness', setting: 'gym', daysPerWeek: 3, schedule: 'Mon · Wed · Fri',
    tips: [...always, 'Alternate A and B: A–B–A one week, B–A–B the next.'], days: [
      day('a', 'Workout A', 'Squat, press and pull', [p('goblet-squat', 3, 8, 12, 120), p('db-bench-press', 3, 8, 12, 120), p('lat-pulldown', 3, 8, 12), p('db-romanian-deadlift', 2, 10, 12), p('dead-bug', 2, 8, 12, 60)]),
      day('b', 'Workout B', 'Legs, row and shoulders', [p('leg-press', 3, 10, 12, 120), p('seated-cable-row', 3, 8, 12), p('db-shoulder-press', 2, 8, 12), p('leg-curl', 2, 10, 12), p('crunch', 2, 10, 15, 60)]),
    ] },
  { id: 'dorm-room-starter', name: 'Dorm-Room Starter', tagline: 'No gym, no equipment — just a floor and a sturdy chair.',
    description: 'A bodyweight routine you can do between classes in your room. It builds the strength and habit you need before moving to the gym.',
    levels: ['beginner'], audience: 'everyone', goal: 'fitness', setting: 'none', daysPerWeek: 3, schedule: 'Any 3 days',
    tips: ['When you reach the top of every rep range, make it harder: slow down the lowering phase or pause at the bottom.', 'Use a desk or bed frame for incline push-ups and a sturdy table for inverted rows.'], days: [
      day('a', 'Workout A', 'Squat, push and row', [p('bodyweight-squat', 3, 12, 20, 60), p('incline-push-up', 3, 8, 15, 60), p('glute-bridge', 3, 12, 20, 60), p('inverted-row', 3, 6, 12, 60), p('dead-bug', 2, 8, 12, 45)]),
      day('b', 'Workout B', 'Lunge, push and core', [p('reverse-lunge', 3, 8, 12, 60), p('push-up', 3, 5, 12, 60), p('single-leg-glute-bridge', 2, 8, 12, 60), p('bench-dip', 2, 8, 15, 60), p('crunch', 2, 12, 20, 45)]),
    ] },
  { id: 'glutes-and-tone-starter', name: 'Glutes & Tone Starter', tagline: 'Lower-body emphasis with balanced upper-body work.',
    description: 'Three gym sessions a week focused on glutes and legs, plus an upper-body day for posture and shape. Machines and dumbbells keep it beginner-friendly.',
    levels: ['beginner'], audience: 'women', goal: 'toning', setting: 'gym', daysPerWeek: 3, schedule: 'Mon · Wed · Fri',
    tips: [...always, 'Start hip thrusts with just the bar (or a dumbbell) and a pad.'], days: [
      day('glutes-legs', 'Glutes & Legs', 'Squat, thrust and hinge', [p('goblet-squat', 3, 10, 12, 120), p('hip-thrust', 3, 10, 12, 120), p('db-romanian-deadlift', 3, 10, 12), p('hip-abduction', 2, 12, 20, 60), p('dead-bug', 2, 8, 12, 60)]),
      day('upper', 'Upper Body', 'Back, shoulders and arms', [p('lat-pulldown', 3, 10, 12), p('db-shoulder-press', 3, 10, 12), p('seated-cable-row', 3, 10, 12), p('incline-push-up', 2, 8, 15, 60), p('lateral-raise', 2, 12, 15, 60)]),
      day('glutes-core', 'Glutes & Core', 'Single-leg work and core', [p('bulgarian-split-squat', 3, 8, 12), p('cable-kickback', 2, 12, 15, 60), p('leg-curl', 2, 10, 15), p('back-extension', 2, 12, 15, 60), p('crunch', 2, 12, 20, 60)]),
    ] },
  { id: 'strength-starter', name: 'Strength Starter', tagline: 'Learn the big barbell lifts and get strong fast.',
    description: 'Two alternating barbell workouts built around the squat, bench, overhead press and deadlift. Beginners can add weight almost every session at first.',
    levels: ['beginner'], audience: 'men', goal: 'strength', setting: 'gym', daysPerWeek: 3, schedule: 'Mon · Wed · Fri',
    tips: [...always, 'Rest a full 2–3 minutes between heavy sets; it is part of the program.'], days: [
      day('a', 'Workout A', 'Squat, bench and row', [p('back-squat', 3, 5, 8, 180), p('bench-press', 3, 5, 8, 180), p('barbell-row', 3, 6, 10, 120), p('db-curl', 2, 8, 12, 60)]),
      day('b', 'Workout B', 'Squat, press and deadlift', [p('back-squat', 3, 5, 8, 180), p('overhead-press', 3, 5, 8, 180), p('deadlift', 2, 5, 6, 180), p('lat-pulldown', 2, 8, 12), p('triceps-pushdown', 2, 10, 12, 60)]),
    ] },
  { id: 'exam-week-express', name: 'Exam-Week Express', tagline: 'Thirty minutes, whole body — keeps the habit alive when time is short.',
    description: 'One efficient workout for busy weeks. Pair the exercises (squat with press, hinge with row) and rest after each pair to finish in about half an hour.',
    levels: ['beginner', 'intermediate', 'advanced'], audience: 'everyone', goal: 'fitness', setting: 'gym', daysPerWeek: 2, schedule: 'Any 2 days',
    tips: ['A short workout still counts. Consistency beats perfect weeks.', 'Return to your main program when the busy week is over.'], days: [
      day('express', 'Express Full Body', 'Everything in 30 minutes', [p('goblet-squat', 3, 8, 12, 60), p('db-bench-press', 3, 8, 12, 60), p('db-romanian-deadlift', 3, 8, 12, 60), p('one-arm-db-row', 3, 8, 12, 60)]),
    ] },
  { id: 'dumbbells-only', name: 'Dumbbells Only', tagline: 'A full program with just dumbbells and a bench.',
    description: 'Ideal for a residence gym or a small home setup. Two alternating full-body days cover every major muscle with progressive dumbbell work.',
    levels: ['beginner', 'intermediate'], audience: 'everyone', goal: 'muscle', setting: 'dumbbells', daysPerWeek: 3, schedule: 'Mon · Wed · Fri',
    tips: [...always, 'When the heaviest dumbbells get easy, slow the lowering phase to three seconds.'], days: [
      day('a', 'Workout A', 'Squat, press and row', [p('goblet-squat', 3, 8, 12, 120), p('db-bench-press', 3, 8, 12, 120), p('one-arm-db-row', 3, 8, 12), p('db-romanian-deadlift', 3, 10, 12), p('lateral-raise', 2, 12, 20, 60)]),
      day('b', 'Workout B', 'Lunge, press and pull', [p('bulgarian-split-squat', 3, 8, 12), p('db-shoulder-press', 3, 8, 12), p('chest-supported-row', 3, 8, 12), p('step-up', 2, 10, 12), p('hammer-curl', 2, 10, 15, 60), p('overhead-triceps-extension', 2, 10, 15, 60)]),
    ] },
  { id: 'upper-lower', name: 'Upper / Lower Split', tagline: 'Four days a week; each muscle trained twice.',
    description: 'The most popular next step after a beginner program. Two upper-body and two lower-body days balance strength and muscle growth.',
    levels: ['intermediate'], audience: 'everyone', goal: 'muscle', setting: 'gym', daysPerWeek: 4, schedule: 'Mon · Tue · Thu · Fri',
    tips: [...always, 'If a session gets skipped, just do the next workout in order.'], days: [
      day('upper-a', 'Upper A', 'Heavy press and row', [p('bench-press', 3, 6, 10, 150), p('barbell-row', 3, 6, 10, 120), p('db-shoulder-press', 2, 8, 12), p('lat-pulldown', 2, 8, 12), p('triceps-pushdown', 2, 10, 15, 60), p('db-curl', 2, 10, 15, 60)]),
      day('lower-a', 'Lower A', 'Squat focus', [p('back-squat', 3, 6, 10, 180), p('romanian-deadlift', 3, 8, 10, 120), p('leg-extension', 2, 10, 15), p('leg-curl', 2, 10, 15), p('calf-raise', 3, 10, 15, 60)]),
      day('upper-b', 'Upper B', 'Incline press and pull-ups', [p('incline-db-press', 3, 8, 12, 120), p('pull-up', 3, 5, 10, 120), p('seated-cable-row', 3, 8, 12), p('lateral-raise', 3, 12, 20, 60), p('overhead-triceps-extension', 2, 10, 15, 60), p('hammer-curl', 2, 10, 15, 60)]),
      day('lower-b', 'Lower B', 'Deadlift focus', [p('deadlift', 2, 5, 8, 180), p('bulgarian-split-squat', 3, 8, 12), p('leg-press', 3, 10, 15, 120), p('hanging-knee-raise', 3, 8, 15, 60), p('calf-raise', 3, 10, 15, 60)]),
    ] },
  { id: 'lower-body-sculpt', name: 'Lower-Body Sculpt', tagline: 'Two glute-focused leg days and two upper-body days.',
    description: 'For students with some gym experience who want stronger glutes and legs. Upper-body days keep your posture and proportions balanced.',
    levels: ['intermediate'], audience: 'women', goal: 'toning', setting: 'gym', daysPerWeek: 4, schedule: 'Mon · Tue · Thu · Fri',
    tips: [...always, 'Pause for one second at the top of every hip thrust and kickback.'], days: [
      day('glutes-a', 'Glutes A', 'Thrust and hinge', [p('hip-thrust', 4, 8, 12, 120), p('romanian-deadlift', 3, 8, 12, 120), p('bulgarian-split-squat', 3, 8, 12), p('hip-abduction', 3, 12, 20, 60), p('cable-crunch', 2, 10, 15, 60)]),
      day('upper-a', 'Upper A', 'Back and shoulders', [p('lat-pulldown', 3, 8, 12), p('db-bench-press', 3, 8, 12), p('seated-cable-row', 3, 10, 12), p('lateral-raise', 3, 12, 20, 60), p('face-pull', 2, 12, 20, 60)]),
      day('legs-b', 'Legs B', 'Squat and lunge', [p('back-squat', 3, 6, 10, 150), p('walking-lunge', 3, 10, 12), p('leg-curl', 3, 10, 15), p('cable-kickback', 3, 12, 15, 60), p('calf-raise', 2, 12, 20, 60)]),
      day('upper-b', 'Upper B', 'Press, row and arms', [p('db-shoulder-press', 3, 8, 12), p('one-arm-db-row', 3, 8, 12), p('push-up', 3, 6, 15, 60), p('triceps-pushdown', 2, 10, 15, 60), p('db-curl', 2, 10, 15, 60), p('dead-bug', 2, 8, 12, 45)]),
    ] },
  { id: 'strength-builder', name: 'Strength Builder', tagline: 'Four heavy days built around the big four lifts.',
    description: 'Each day starts with one main barbell lift in low rep ranges, followed by supporting exercises. Built for steady strength gains after your beginner phase.',
    levels: ['intermediate'], audience: 'men', goal: 'strength', setting: 'gym', daysPerWeek: 4, schedule: 'Mon · Tue · Thu · Fri',
    tips: [...always, 'On main lifts, add weight only when every set reaches the top of the range with good form.'], days: [
      day('squat', 'Squat Day', 'Back squat and legs', [p('back-squat', 4, 4, 6, 180), p('romanian-deadlift', 3, 6, 8, 150), p('leg-press', 2, 8, 12, 120), p('hanging-knee-raise', 3, 8, 15, 60)]),
      day('bench', 'Bench Day', 'Bench press and back', [p('bench-press', 4, 4, 6, 180), p('barbell-row', 4, 6, 8, 120), p('dips', 3, 6, 10, 120), p('db-curl', 2, 8, 12, 60)]),
      day('deadlift', 'Deadlift Day', 'Deadlift and single-leg work', [p('deadlift', 3, 3, 5, 210), p('bulgarian-split-squat', 3, 6, 10, 120), p('leg-curl', 3, 8, 12), p('cable-crunch', 3, 10, 15, 60)]),
      day('press', 'Press Day', 'Overhead press and pull-ups', [p('overhead-press', 4, 4, 6, 180), p('pull-up', 4, 5, 8, 120), p('incline-db-press', 3, 8, 10, 120), p('triceps-pushdown', 2, 10, 12, 60)]),
    ] },
  { id: 'push-pull-legs', name: 'Push / Pull / Legs', tagline: 'Six focused days for maximum muscle growth.',
    description: 'A high-volume split for experienced lifters: every muscle twice a week with 10–20 hard sets. Sunday is the rest day.',
    levels: ['advanced'], audience: 'men', goal: 'muscle', setting: 'gym', daysPerWeek: 6, schedule: 'Mon – Sat',
    tips: [...always, 'Most sets should finish 0–3 reps short of failure.', 'If you feel run down, take an extra rest day; the order continues where you left off.'], days: [
      day('pull-a', 'Pull A', 'Back, rear delts and biceps', [p('pull-up', 3, 6, 10, 150), p('seated-cable-row', 3, 8, 12, 120), p('rear-delt-fly', 2, 12, 20, 60), p('incline-db-curl', 3, 8, 12, 60)]),
      day('push-a', 'Push A', 'Chest, shoulders and triceps', [p('bench-press', 3, 6, 10, 180), p('dips', 3, 6, 12, 120), p('db-shoulder-press', 2, 8, 12, 120), p('lateral-raise', 4, 12, 20, 60), p('triceps-pushdown', 3, 10, 15, 60)]),
      day('legs-a', 'Legs A', 'Quads, hamstrings and core', [p('leg-press', 3, 8, 12, 150), p('romanian-deadlift', 3, 8, 12, 150), p('leg-curl', 3, 10, 15), p('leg-extension', 2, 10, 15), p('calf-raise', 2, 12, 20, 60), p('cable-crunch', 3, 10, 20, 60)]),
      day('pull-b', 'Pull B', 'Lats, upper back and arms', [p('lat-pulldown', 3, 8, 12, 120), p('chest-supported-row', 3, 8, 12, 120), p('face-pull', 2, 12, 20, 60), p('hammer-curl', 3, 8, 15, 60)]),
      day('push-b', 'Push B', 'Upper chest and shoulders', [p('dips', 3, 6, 12, 120), p('incline-db-press', 3, 8, 12, 120), p('cable-fly', 3, 10, 15, 60), p('lateral-raise', 4, 12, 20, 60), p('overhead-triceps-extension', 3, 10, 15, 60)]),
      day('legs-b', 'Legs B', 'Glutes and single-leg work', [p('bulgarian-split-squat', 3, 8, 12, 120), p('hip-thrust', 3, 8, 12, 120), p('leg-curl', 3, 10, 15), p('leg-extension', 2, 10, 15), p('back-extension', 2, 10, 15, 60), p('calf-raise', 2, 12, 20, 60)]),
    ] },
  { id: 'glute-builder', name: 'Glute Builder', tagline: 'Five days with three dedicated glute sessions.',
    description: 'An advanced split that trains glutes three times a week with heavy, moderate and high-rep days, plus two upper-body sessions for balance.',
    levels: ['advanced'], audience: 'women', goal: 'muscle', setting: 'gym', daysPerWeek: 5, schedule: 'Mon – Fri',
    tips: [...always, 'Heavy day: push the weight. Pump day: chase the squeeze, not the number.'], days: [
      day('glutes-heavy', 'Glutes Heavy', 'Low reps, big lifts', [p('hip-thrust', 4, 6, 10, 150), p('back-squat', 3, 6, 10, 180), p('romanian-deadlift', 3, 8, 10, 150), p('hip-abduction', 3, 15, 20, 60)]),
      day('upper-a', 'Upper Push & Pull', 'Back, shoulders and triceps', [p('lat-pulldown', 3, 8, 12), p('db-shoulder-press', 3, 8, 12), p('seated-cable-row', 3, 8, 12), p('lateral-raise', 3, 12, 20, 60), p('triceps-pushdown', 2, 10, 15, 60)]),
      day('glutes-hams', 'Glutes & Hamstrings', 'Hinge and single-leg', [p('bulgarian-split-squat', 3, 8, 12, 120), p('leg-curl', 3, 10, 15), p('back-extension', 3, 12, 15, 60), p('cable-kickback', 3, 12, 15, 60)]),
      day('upper-b', 'Upper Back & Arms', 'Pull-ups and posture', [p('pull-up', 3, 4, 8, 150), p('one-arm-db-row', 3, 8, 12), p('face-pull', 3, 12, 20, 60), p('push-up', 2, 8, 15, 60), p('db-curl', 2, 10, 15, 60)]),
      day('glutes-pump', 'Glute Pump', 'Higher reps and core', [p('hip-thrust', 3, 12, 15, 90), p('walking-lunge', 3, 10, 12), p('step-up', 2, 10, 12), p('hip-abduction', 2, 15, 25, 60), p('cable-crunch', 3, 10, 15, 60)]),
    ] },
];

const exerciseIndex = new Map(gymExercises.map(item => [item.id, item]));
const programIndex = new Map(gymPrograms.map(item => [item.id, item]));
export const findGymExercise = (id: string): GymExercise | undefined => exerciseIndex.get(id);
export const findGymProgram = (id: string): GymProgram | undefined => programIndex.get(id);
export const findProgramDay = (programId: string, dayId: string): ProgramDay | undefined => findGymProgram(programId)?.days.find(item => item.id === dayId);
