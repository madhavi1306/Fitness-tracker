import { Dumbbell } from 'lucide-react';

export default function ExerciseArt({ exercise, compact = false }) {
  return (
    <div className={`exercise-art${compact ? ' exercise-art-compact' : ''}`} aria-label={`${exercise.name} illustration`}>
      {exercise.imageUrl
        ? <img src={exercise.imageUrl} alt="" loading="lazy" />
        : <><span className="exercise-art-orbit" /><Dumbbell size={compact ? 30 : 42} strokeWidth={1.3} /><small>{exercise.muscleGroup}</small></>}
    </div>
  );
}
