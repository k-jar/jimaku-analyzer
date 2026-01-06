export const getReadabilityLabel = (score: number) => {
  // Score is 0 (Easier) to 10 (Harder)
  // Updated Mapping:
  // Score 8.5 - 10.0 -> Advanced (N1)
  // Score 7.0 - 8.4  -> Upper-Intermediate (N2 Hard)
  // Score 5.0 - 6.9  -> Intermediate (N2)
  // Score 2.5 - 4.9  -> Lower-Intermediate (N3 Hard)
  // Score 1.0 - 2.4  -> Pre-Intermediate (N3)
  // Score 0.0 - 0.9  -> Beginner (N4)

  if (score >= 8.5)
    return {
      label: "Advanced",
      color: "text-red-700 bg-red-100 border-red-200",
    };
  if (score >= 7.0)
    return {
      label: "Upper-Intermediate",
      color: "text-orange-700 bg-orange-100 border-orange-200",
    };
  if (score >= 5.0)
    return {
      label: "Intermediate",
      color: "text-yellow-700 bg-yellow-100 border-yellow-200",
    };
  if (score >= 2.5)
    return {
      label: "Lower-Intermediate",
      color: "text-blue-700 bg-blue-100 border-blue-200",
    };
  if (score >= 1.0)
    return {
      label: "Pre-Intermediate",
      color: "text-cyan-700 bg-cyan-100 border-cyan-200",
    };

  return {
    label: "Beginner",
    color: "text-emerald-700 bg-emerald-100 border-emerald-200",
  };
};
