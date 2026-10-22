export function macroF1(actual: string[], predicted: string[]): number {
  const labels = [...new Set([...actual, ...predicted])];
  if (labels.length === 0) return 0;
  let total = 0;
  for (const label of labels) {
    let tp = 0;
    let fp = 0;
    let fn = 0;
    for (let i = 0; i < actual.length; i += 1) {
      const truth = actual[i] === label;
      const guess = predicted[i] === label;
      if (truth && guess) tp += 1;
      else if (guess) fp += 1;
      else if (truth) fn += 1;
    }
    const precision = tp + fp === 0 ? 0 : tp / (tp + fp);
    const recall = tp + fn === 0 ? 0 : tp / (tp + fn);
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    total += f1;
  }
  return total / labels.length;
}

export function accuracy(actual: string[], predicted: string[]): number {
  if (actual.length === 0) return 0;
  let correct = 0;
  for (let i = 0; i < actual.length; i += 1) if (actual[i] === predicted[i]) correct += 1;
  return correct / actual.length;
}

export function precisionRecall(actual: string[], predicted: string[], label: string): { precision: number; recall: number } {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  for (let i = 0; i < actual.length; i += 1) {
    const truth = actual[i] === label;
    const guess = predicted[i] === label;
    if (truth && guess) tp += 1;
    else if (guess) fp += 1;
    else if (truth) fn += 1;
  }
  return {
    precision: tp + fp === 0 ? 0 : tp / (tp + fp),
    recall: tp + fn === 0 ? 0 : tp / (tp + fn),
  };
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function round(value: number, digits = 3): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
