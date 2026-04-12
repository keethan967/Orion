// src/db/seeds/index.js
// Seeds the podcast catalog and creates test user in development
require('dotenv').config({ path: require('path').join(__dirname, '../../../.env') });
const { query, pool } = require('../../config/database');

const PODCASTS = [
  {
    title: 'The Art of Returning to Stillness',
    host: 'Orion Sessions',
    description: 'A guided reflection on how stillness is not an absence but a skill — one that can be practiced and deepened every day.',
    theme: 'Calmness',
    duration_secs: 480,
    audio_url: '/audio/calmness-stillness.mp3',
    transcript: `Welcome to Orion Sessions. Find a comfortable position, allow your breath to soften, and give yourself full permission to arrive in this moment.

Today we explore the art of returning to stillness.

Most of us believe that calmness is something that happens to us — a state we stumble into when circumstances are favorable. But that understanding is incomplete. Stillness is not a reward that arrives when the world cooperates. It is a discipline. A practice. A skill that deepens with use.

The ancient Stoics understood this well. Marcus Aurelius, writing to himself in the evenings after days filled with the weight of empire, did not wait for silence to find him. He created it — in the space between events, in the pause before response, in the deliberate act of returning his attention to what he could control.

The practice of returning to stillness begins with one simple act: noticing. Not judging, not suppressing — simply noticing that you have drifted, and choosing to return.

Rest here for a moment before you continue. The stillness is yours.`,
    sort_order: 1,
  },
  {
    title: 'Breathing as an Anchor',
    host: 'Orion Sessions',
    description: 'How the breath connects body and mind, and why returning to it in difficult moments is one of the most powerful things you can do.',
    theme: 'Calmness',
    duration_secs: 360,
    audio_url: '/audio/calmness-breathing.mp3',
    transcript: `Welcome. Before we begin, take one deliberate breath — slow, full, and conscious. Let that breath be your signal that you are transitioning from doing into being.

Today we speak about the breath as an anchor.

The breath is perhaps the most underestimated tool available to any human being. It is always present. It requires no equipment, no preparation, no ideal conditions. It bridges the unconscious and the conscious in a way nothing else does.

The practice is simple. When you feel the pull of anxiety, anchor to the breath. Four counts in through the nose. Hold for four. Six counts out through the mouth. Repeat three times.

Trust it. Return to it. Let it be your anchor.`,
    sort_order: 2,
  },
  {
    title: 'The Quiet Power of Small Commitments',
    host: 'The Becoming',
    description: 'Why discipline is not about grand gestures but about the small, unglamorous choices made daily — and how they compound into transformation.',
    theme: 'Discipline',
    duration_secs: 540,
    audio_url: '/audio/discipline-small-commitments.mp3',
    transcript: `Welcome to The Becoming. Settle in, and let us begin.

Today we speak about the quiet power of small commitments.

There is a common misconception about discipline — that it looks like dramatic sacrifice and heroic consistency. This image is harmful. It sets an impossible standard.

Discipline is a practice — a series of small, daily choices that accumulate invisibly over time until they become the architecture of a life.

James Clear observed that every action you take is a vote for the type of person you wish to become. You don't need a majority in a single day. You just need to keep casting votes.

Today, choose one small commitment. Something specific, something concrete, something you can honor in the next twenty-four hours.

That promise, honored, is the beginning of everything.`,
    sort_order: 3,
  },
  {
    title: 'On Doing the Hard Thing First',
    host: 'The Becoming',
    description: 'The philosophy and neuroscience behind why tackling your most demanding work at the start of the day transforms everything that follows.',
    theme: 'Discipline',
    duration_secs: 420,
    audio_url: '/audio/discipline-hard-thing.mp3',
    transcript: `Welcome. Today we explore why doing the hardest thing first transforms your entire day.

In the first hours after waking, the prefrontal cortex is at its most capable. Decision fatigue has not yet set in. Willpower is fully rested.

By late afternoon, these resources are depleted. The hardest work, done then, will take twice as long and produce half the quality.

But there is something deeper here than neuroscience. Doing the hard thing first is a statement to yourself about who you are. It says: I am not managed by comfort. I am not a servant of ease.

Each evening, identify the one task tomorrow that you most want to avoid. Place it first on your morning list.

Then, tomorrow morning, before anything else, begin.`,
    sort_order: 4,
  },
  {
    title: 'The Practice of Evening Review',
    host: 'Orion Sessions',
    description: 'Drawing from Marcus Aurelius: why reviewing your day with honest compassion is one of the most transformative practices available.',
    theme: 'Reflection',
    duration_secs: 480,
    audio_url: '/audio/reflection-evening-review.mp3',
    transcript: `Welcome back to Orion Sessions. This episode is best experienced in the evening.

Today we explore the practice of evening review.

Marcus Aurelius was one of the most powerful men in the ancient world — and yet each evening, he sat with his journal and examined his day. Not to catalog achievements. Not to punish himself. But to understand where his actions aligned with his values and where they did not.

The practice is simple. Ask yourself three questions.

Where did I act in alignment with the person I intend to be?

Where did I fall short, and what led me there?

What will I do differently tomorrow?

That is the entire practice. You are not just living your life. You are studying it.

And a life studied is a life transformed.`,
    sort_order: 5,
  },
  {
    title: 'What Silence Reveals',
    host: 'Orion Sessions',
    description: 'A meditation on why modern people fear silence — and what becomes available when we learn to sit with it.',
    theme: 'Reflection',
    duration_secs: 420,
    audio_url: '/audio/reflection-silence.mp3',
    transcript: `Welcome. I want to begin today with an observation.

Most people in the modern world are almost never in true silence. There is always a podcast, a playlist, a notification. The space between thoughts is filled with more content.

Silence is not empty. Silence is full — full of the things we have not yet allowed ourselves to notice. The creative ideas that require stillness to surface. The subtle sense of what we actually want, beneath the noise of what we think we should want.

Begin with two minutes. Set a timer, put down every device, and simply sit. Notice what arises. Let thoughts move through without catching them.

The answers you have been searching for externally very often live in the silence you have been avoiding.

Give yourself two minutes of it today. And notice what speaks.`,
    sort_order: 6,
  },
  {
    title: 'The Architecture of Deep Work',
    host: 'Focus Dialogues',
    description: 'How to build the internal and external conditions for sustained, undistracted attention.',
    theme: 'Focus',
    duration_secs: 540,
    audio_url: '/audio/focus-deep-work.mp3',
    transcript: `Welcome to Focus Dialogues.

The topic today is the architecture of deep work.

Deep work is professional activity performed in a state of distraction-free concentration that pushes your cognitive capabilities to their limit. These efforts create new value, improve your skill, and are hard to replicate.

The most productive creators in history did not wait for inspiration. They built rituals — specific times, specific places, specific signals that told the mind: now we go deep.

Three principles. First, ritualize. Second, protect. Deep work requires defended time — blocks in your calendar that you treat as non-negotiable commitments.

Third, train. The ability to focus is not fixed. It atrophies with neglect and strengthens with practice.

What would you build if you had one full hour of genuine depth each day?

That question is worth sitting with.`,
    sort_order: 7,
  },
  {
    title: 'Single-Tasking as Sacred Practice',
    host: 'Focus Dialogues',
    description: 'Why multitasking is a myth, what it costs your brain, and how doing one thing at a time changes everything.',
    theme: 'Focus',
    duration_secs: 360,
    audio_url: '/audio/focus-single-tasking.mp3',
    transcript: `Welcome. Let us begin with a myth worth dismantling.

Multitasking does not exist.

What we call multitasking is rapid task-switching — the brain paying a cognitive cost with each transition. Research suggests switching tasks can cost as much as forty percent of productive time.

The antidote is deceptively simple: do one thing at a time.

When you eat, eat. When you write, write. When you are in conversation with someone, be fully in conversation.

Choose one activity today — one meeting, one creative session, one meal — and give it your complete and undivided attention.

One thing at a time. It is a radical act in this world.`,
    sort_order: 8,
  },
  {
    title: 'The Identity Beneath the Habit',
    host: 'The Becoming',
    description: 'Why trying to change behaviors without changing identity rarely works — and the deeper shift that makes lasting transformation possible.',
    theme: 'Mindset',
    duration_secs: 480,
    audio_url: '/audio/mindset-identity.mp3',
    transcript: `Welcome to The Becoming.

Today we explore the identity beneath the habit.

Most approaches to personal change focus on behaviors. These frequently fail. Not because the person lacks willpower. They fail because they are trying to build new behaviors on an unchanged foundation of identity.

The most effective way to change your habits is to focus not on what you want to achieve, but on who you wish to become.

Every action you take is a vote for a particular type of person. Every time you choose the difficult conversation over avoidance, you cast a vote for: I am someone of integrity.

You do not need a majority on any given day. You simply need to keep voting.

The question is not: what habits do I want to build?

The question is: who am I becoming?`,
    sort_order: 9,
  },
  {
    title: 'Letting Go of the Need to Be Ready',
    host: 'Orion Sessions',
    description: 'Why waiting until you feel ready is a trap — and how starting before you feel prepared is the only honest path to capability.',
    theme: 'Mindset',
    duration_secs: 360,
    audio_url: '/audio/mindset-readiness.mp3',
    transcript: `Welcome to Orion Sessions.

There is a thought that has stopped more potential than any external obstacle. It sounds like wisdom. But it is not.

That thought is: I will begin when I am ready.

You do not become ready before you begin. You become ready by beginning. Readiness is not a prerequisite. It is a result.

Steven Pressfield identified what he calls the Resistance — that inner voice that whispers: not yet, not you, not enough. The strength of the Resistance is in direct proportion to the importance of the work.

When you feel most strongly that you are not ready, you are often standing closest to the threshold of something that matters.

You do not need to feel ready. You need to begin.

Begin today. Imperfectly. Incompletely. The readiness will follow.`,
    sort_order: 10,
  },
];

async function seed() {
  console.log('Seeding podcast catalog...');

  for (const p of PODCASTS) {
    const existing = await query(
      'SELECT id FROM podcasts WHERE title = $1', [p.title]
    );
    if (existing.rows.length > 0) {
      console.log(`  ↩  Exists: ${p.title}`);
      continue;
    }
    await query(
      `INSERT INTO podcasts (title, host, description, theme, duration_secs, audio_url, transcript, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [p.title, p.host, p.description, p.theme, p.duration_secs, p.audio_url, p.transcript, p.sort_order]
    );
    console.log(`  ✓  Seeded: ${p.title}`);
  }

  console.log('\nSeed complete.');
  await pool.end();
}

seed().catch(err => { console.error(err); process.exit(1); });
