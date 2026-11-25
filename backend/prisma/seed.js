import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { seedFoods } from '../src/data/foods.js';

const prisma = new PrismaClient();

const exercises = [
  ['Barbell Bench Press', 'Chest', 'Barbell', 'A compound press for chest strength.', 'Intermediate', ['Set your eyes beneath the bar.', 'Grip slightly wider than shoulder width.', 'Lower to the mid-chest with control, then press up.']],
  ['Dumbbell Chest Press', 'Chest', 'Dumbbells', 'A balanced horizontal press with a comfortable range of motion.', 'Beginner', ['Lie on a flat bench with dumbbells over your chest.', 'Lower the weights beside your chest.', 'Press upward without letting the dumbbells touch.']],
  ['Lat Pulldown', 'Back', 'Cable', 'A vertical pull that trains the lats and upper back.', 'Beginner', ['Sit tall and secure your thighs beneath the pads.', 'Pull the bar toward your upper chest.', 'Return overhead slowly without shrugging.']],
  ['One-Arm Dumbbell Row', 'Back', 'Dumbbells', 'A unilateral row for the lats and mid-back.', 'Beginner', ['Brace one hand on a bench.', 'Pull the dumbbell toward your hip.', 'Lower fully while keeping your back steady.']],
  ['Barbell Back Squat', 'Legs', 'Barbell', 'A compound lower-body squat for the quads and glutes.', 'Advanced', ['Place the bar securely across your upper back.', 'Brace and sit down between your hips.', 'Drive through your feet to stand tall.']],
  ['Dumbbell Romanian Deadlift', 'Legs', 'Dumbbells', 'A hip hinge that emphasizes the hamstrings and glutes.', 'Intermediate', ['Stand with weights in front of your thighs.', 'Push your hips back with a soft knee bend.', 'Stand by bringing your hips forward.']],
  ['Seated Leg Curl', 'Legs', 'Machine', 'A machine curl that isolates the hamstrings.', 'Beginner', ['Adjust the machine so the knee joint aligns with its pivot.', 'Curl the pad toward the back of your thighs.', 'Return to the start slowly.']],
  ['Dumbbell Shoulder Press', 'Shoulders', 'Dumbbells', 'A vertical press for the shoulders and triceps.', 'Beginner', ['Hold dumbbells at shoulder height.', 'Brace your torso and press overhead.', 'Lower slowly to the starting position.']],
  ['Cable Lateral Raise', 'Shoulders', 'Cable', 'A controlled lateral raise for the side delts.', 'Intermediate', ['Stand beside a low cable with a relaxed elbow.', 'Raise your arm out to shoulder height.', 'Lower with control and avoid swinging.']],
  ['Dumbbell Biceps Curl', 'Arms', 'Dumbbells', 'An isolation exercise for the biceps.', 'Beginner', ['Stand tall with arms by your sides.', 'Curl the weights while keeping elbows close.', 'Lower fully without rocking your torso.']],
  ['Cable Triceps Pressdown', 'Arms', 'Cable', 'A cable isolation exercise for the triceps.', 'Beginner', ['Keep elbows tucked beside your torso.', 'Press the handle down until your arms extend.', 'Return slowly while keeping elbows still.']],
  ['Plank', 'Core', 'Bodyweight', 'An isometric hold that challenges the trunk.', 'Beginner', ['Place forearms on the floor beneath your shoulders.', 'Extend your legs and brace your abdomen.', 'Keep a straight line from head to heels.']],
  ['Resistance Band Dead Bug', 'Core', 'Resistance Bands', 'A controlled core drill that trains trunk stability.', 'Intermediate', ['Anchor a light band above your head and lie on your back.', 'Brace your trunk and extend the opposite arm and leg.', 'Return slowly and alternate sides.']],
];

try {
  for (const [name, muscleGroup, equipment, description, difficulty, instructions] of exercises) {
    const existing = await prisma.exercise.findFirst({ where: { ownerId: null, name } });
    if (!existing) {
      await prisma.exercise.create({
        data: { name, muscleGroup, equipment, description, difficulty, instructions },
      });
    }
  }
  for (const food of seedFoods) {
    const existing = await prisma.food.findFirst({
      where: { ownerId: null, name: { equals: food.name, mode: 'insensitive' } },
    });
    if (!existing) await prisma.food.create({ data: { ...food, ownerId: null } });
  }
  console.log(`Seed complete (${exercises.length} built-in exercises, ${seedFoods.length} built-in foods).`);
} finally {
  await prisma.$disconnect();
}
