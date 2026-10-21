export const helpTopics = ['Study & planning', 'Using CampusFlow', 'Your data'] as const;
export type HelpTopic = (typeof helpTopics)[number];
export type HelpArticle = {
  id: string; topic: HelpTopic; question: string; answer: string; keywords: string;
  action?: { label: string; path: '/tasks' | '/planner' | '/academics' | '/study-plans' | '/focus' | '/settings' | '/account' | '/reminders' };
};

export const helpArticles: readonly HelpArticle[] = [
  { id: 'today', topic: 'Study & planning', question: 'Why isn’t my task in Today?', keywords: 'daily plan undated schedule deadline main goal',
    answer: 'Today includes work scheduled or due that day, open overdue work, routine occurrences and saved events you include in your plan. An undated task stays in Tasks unless you schedule it or choose it as your Main Goal.',
    action: { label: 'Open Tasks', path: '/tasks' } },
  { id: 'week', topic: 'Study & planning', question: 'How do I plan around my classes?', keywords: 'weekly timetable study windows booking calendar',
    answer: 'Add your weekly classes in Class timetable, then open Weekly planner to see classes and saved commitments together. Suggested study windows use the information you’ve saved; review a window before booking a task into it.',
    action: { label: 'Open Weekly planner', path: '/planner' } },
  { id: 'coursework', topic: 'Study & planning', question: 'Can I add coursework without Canvas?', keywords: 'assignment quiz exam manual university connection',
    answer: 'Yes. Coursework lets you add and manage your own assignments, quizzes and exams. To import from Canvas, open Settings → Canvas and follow the steps to create an access token. Coursework you enter yourself remains useful without a Canvas connection.',
    action: { label: 'Open Coursework', path: '/academics' } },
  { id: 'preparation', topic: 'Study & planning', question: 'How do I break a deadline into study sessions?', keywords: 'preparation assignment exam estimate catch up',
    answer: 'Use Prepare from a coursework item to review a plan of smaller tasks before saving. My study plans brings those sessions together so you can edit, reschedule, focus on and complete them. Completing a study session does not submit coursework to your university.',
    action: { label: 'Open My study plans', path: '/study-plans' } },
  { id: 'focus', topic: 'Study & planning', question: 'Does the focus timer save my study time automatically?', keywords: 'timer recovery finished block paused closed app',
    answer: 'Save a finished or early-ended block explicitly to add it to your study history. If the app closes with an unsaved block, Focus offers recovery. Uncertain time while the app was closed is excluded. Saving focus time does not complete the linked task.',
    action: { label: 'Open Focus', path: '/focus' } },
  { id: 'offline', topic: 'Using CampusFlow', question: 'What can I do without a connection?', keywords: 'offline wifi network cache internet sync failed save',
    answer: 'Previously saved information can be read from this device’s cache. Saved or stale notices show when fresh information is unavailable. Changes need a connection to CampusFlow; they are not queued for later. If a save fails, keep the editor open and retry when connected.' },
  { id: 'reminders', topic: 'Using CampusFlow', question: 'Why didn’t a reminder arrive?', keywords: 'notifications permission quiet hours edit delete device refresh',
    answer: 'Allow notifications on this device, check the reminder category and quiet hours in Settings, then refresh device reminders. My reminders shows saved times and opens the matching task, coursework, routine or saved event. It is not a delivery history. Reminders are scheduled on each device. Server changes cannot update another offline device’s existing schedule until it refreshes.',
    action: { label: 'Open my reminders', path: '/reminders' } },
  { id: 'saved-data', topic: 'Your data', question: 'Where are my student records and check-ins saved?', keywords: 'privacy wellness journal mood energy stress note account server',
    answer: 'Your email, name and time zone identify your CampusFlow account. Saved tasks, coursework, classes, plans, study time, routines, check-ins and saved-event choices are stored with that account on the CampusFlow server. Optional check-in ratings and notes are sent when you save. This device also keeps account-specific cached information for offline reading.',
    action: { label: 'Manage account & data', path: '/account' } },
  { id: 'export', topic: 'Your data', question: 'How do I download my data?', keywords: 'export json share copy credentials password',
    answer: 'Open Account & privacy and prepare a copy of your server-saved data. You choose whether to download or share the JSON file. It excludes passwords and access tokens, and does not include unsaved device drafts. Store the exported file somewhere you trust.',
    action: { label: 'Open data export', path: '/account' } },
  { id: 'delete', topic: 'Your data', question: 'What happens when I delete my account?', keywords: 'erase remove log backup retention sign out cleanup',
    answer: 'Confirm deletion in Account & privacy with your password. A confirmed deletion removes your linked student records and revokes server access. This device clears its session, caches, focus recovery and reminders, with a retry if cleanup fails. Downloaded exports and copies on other offline devices are separate; this is not a promise about backup or log retention periods.',
    action: { label: 'Open account controls', path: '/account' } },
];

export function findHelp(query: string, topic?: HelpTopic) {
  const words = query.slice(0, 100).trim().toLowerCase().split(/\s+/).filter(Boolean);
  return helpArticles.filter(article => (!topic || topic === article.topic) && words.every(word =>
    `${article.question} ${article.answer} ${article.keywords}`.toLowerCase().includes(word)));
}
