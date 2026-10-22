import { ModelBundle } from '../nlp/models.js';
import { createTrainedBundle } from '../nlp/experiment.js';

let bundle: ModelBundle | null = null;

export function getBundle(): ModelBundle {
  if (!bundle?.trained) {
    bundle = createTrainedBundle();
  }
  return bundle;
}

export function warmModels(): ModelBundle {
  bundle = createTrainedBundle();
  return bundle;
}
