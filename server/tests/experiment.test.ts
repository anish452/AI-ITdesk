import { describe, expect, it } from 'vitest';
import { expandScenario, materialiseRecords, scenarios } from '../src/data/scenarios.js';
import { hypothesisVerdict, createTrainedBundle, runExperiment } from '../src/nlp/experiment.js';
import { macroF1 } from '../src/nlp/metrics.js';
import { anonymize } from '../src/nlp/models.js';

describe('synthetic service-desk corpus', () => {
  it('covers every category in train and test', () => {
    const records = materialiseRecords();
    const categories = new Set(records.map((record) => record.category));
    expect(categories.size).toBe(7);
    expect(records.filter((record) => record.split === 'TEST').length).toBeGreaterThan(40);
  });
});

describe('multi-agent experiment', () => {
  const report = runExperiment();

  it('produces a finite classification score', () => {
    expect(report.classification.agent.macroF1).toBeGreaterThan(0.5);
    expect(macroF1(['ERP', 'MES'], ['ERP', 'MES'])).toBe(1);
  });

  it('keeps the learning update inside the knowledge base rather than model weights', () => {
    expect(report.learning.recordsAdded).toBeGreaterThan(0);
    expect(report.learning.hitAt5After).toBeGreaterThanOrEqual(report.learning.hitAt5Before);
  });

  it('states whether each hypothesis is supported by the measured scores', () => {
    const verdicts = hypothesisVerdict(report);
    expect(verdicts).toHaveLength(3);
    expect(verdicts.every((verdict) => typeof verdict.supported === 'boolean')).toBe(true);
  });
});

describe('printer failures', () => {
  const bundle = createTrainedBundle();

  it('classifies a printout error as hardware even when the form still names SAP', () => {
    const result = bundle.classificationAgent(
      'Cannot print printouts',
      'When I print it shows an error message',
      'SAP S/4HANA',
    );
    expect(result.category).toBe('HARDWARE');
  });

  it('keeps a label-printer network outage on the network queue', () => {
    const scenario = scenarios.find((item) => item.key === 'net-printer-vlan');
    const sample = expandScenario(scenario!, 0);
    const result = bundle.classificationAgent(sample.title, sample.description, scenario!.system);
    expect(result.category).toBe('NETWORK');
  });
});

describe('anonymiser', () => {
  it('removes an email address before text is stored for retrieval', () => {
    expect(anonymize('Contact planner@northline.example about the jam')).toContain('[email]');
    expect(anonymize('Contact planner@northline.example about the jam')).not.toContain('@');
  });
});
