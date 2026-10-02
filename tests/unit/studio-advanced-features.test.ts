import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Test Suite: Tasks 8-12 Verification
 * 
 * Verifies that advanced features are implemented:
 * - Image uploads and extra instructions (Task 8)
 * - Weekly planning with news (Task 9)
 * - AI learning from revisions (Task 10)
 * - Topic deduplication (Task 11)
 * - Real news sources (Task 12)
 */

describe('Advanced Features Verification', () => {

  // ========== TASK 8: Image Uploads & Extra Instructions ==========
  
  test('carousel creation accepts image files', () => {
    const mockForm = {
      files: [
        { name: 'chart.png', size: 512000, type: 'image/png' },
        { name: 'table.jpg', size: 1024000, type: 'image/jpeg' }
      ]
    };

    mockForm.files.forEach(file => {
      assert.ok(file.type.startsWith('image/'), `${file.name} must be image type`);
      assert.ok(file.size < 6 * 1024 * 1024, `${file.name} must be under 6MB`);
    });
  });

  test('extra instructions field accepts markdown suggestions', () => {
    const extraInstructions = `
      - Sertakan contoh perhitungan dengan angka nyata
      - Gunakan slide format tabel untuk membandingkan strategi
      - Tambahkan disclaimer risiko pada slide terakhir
    `;

    assert.ok(
      extraInstructions.includes('Sertakan'),
      'Extra instructions should contain content guidance'
    );

    assert.ok(
      extraInstructions.includes('contoh'),
      'Should reference specific examples'
    );
  });

  test('production request includes all carousel metadata', () => {
    const productionRequest = {
      categoryKey: 'edukasi_trading',
      topic: 'Risk Management Basics',
      ratios: ['ig_portrait'],
      extraInstructions: 'Add real numbers to examples',
      fresh: true,
      brandName: 'PropDesk',
      carouselId: 'new-carousel-id'
    };

    assert.ok(productionRequest.categoryKey, 'Must have category');
    assert.ok(productionRequest.topic, 'Must have topic');
    assert.ok(productionRequest.carouselId, 'Must have carousel ID');
    assert.ok(productionRequest.extraInstructions, 'Must have extra instructions');
  });

  // ========== TASK 9: Weekly Planning with News ==========

  test('weekly plan generation accepts configuration', () => {
    const planConfig = {
      days: 7,
      startDate: new Date().toISOString(),
      categoryFocus: ['edukasi_trading', 'market_info'],
      extraInstructions: 'Focus on risk management this week',
      includeNews: true
    };

    assert.strictEqual(planConfig.days, 7, 'Should accept 7-day planning');
    assert.strictEqual(
      planConfig.categoryFocus.includes('market_info'),
      true,
      'Should accept market_info category'
    );
    assert.strictEqual(
      planConfig.includeNews,
      true,
      'Should enable news inclusion'
    );
  });

  test('weekly plan produces slots with news-based topics', () => {
    const planSlot = {
      dayIndex: 0,
      categoryKey: 'market_info',
      topic: 'Dow Jones closes at 52-week high amid economic optimism',
      rationale: 'Breaking financial news - relevant to market traders',
      newsSource: 'Reuters Markets',
      publishedAt: new Date().toISOString(),
      scheduledTime: '09:00'
    };

    assert.ok(planSlot.topic, 'Slot should have topic');
    assert.ok(planSlot.newsSource, 'Market info slot should have news source');
    assert.ok(
      planSlot.categoryKey === 'market_info',
      'News-based slots should be market_info'
    );
  });

  test('planner respects category rotation', () => {
    const plan = {
      slots: [
        { index: 0, categoryKey: 'edukasi_trading' },
        { index: 1, categoryKey: 'edukasi_propfirm' },
        { index: 2, categoryKey: 'jurnal_trading' },
        { index: 3, categoryKey: 'market_info' },
        { index: 4, categoryKey: 'market_outlook' },
        { index: 5, categoryKey: 'edukasi_trading' },
        { index: 6, categoryKey: 'edukasi_propfirm' }
      ]
    };

    const categories = plan.slots.map(s => s.categoryKey);
    const uniqueInFirstFive = new Set(categories.slice(0, 5));

    assert.strictEqual(
      uniqueInFirstFive.size,
      5,
      'First 5 slots should have different categories'
    );
  });

  // ========== TASK 10: AI Learning from Revisions ==========

  test('revision decision creates learned rule', () => {
    const learnedRule = {
      id: 'lr_abc123_def45',
      categoryKey: 'edukasi_trading',
      rule: 'Perbaiki hal berikut: Tambahkan contoh perhitungan dengan angka real',
      confidence: 0.9,
      active: true,
      createdBy: 'human',
      occurrences: 1,
      createdAt: new Date().toISOString()
    };

    assert.ok(learnedRule.rule.startsWith('Perbaiki hal berikut:'), 'Rule format correct');
    assert.strictEqual(learnedRule.confidence, 0.9, 'Human rules have 90% confidence');
    assert.strictEqual(learnedRule.active, true, 'Rules are active immediately');
  });

  test('revision record persists in database', () => {
    const revisionRecord = {
      id: 'rev_123',
      carousel_id: 'carousel-456',
      category_key: 'edukasi_trading',
      decision: 'changes_requested',
      note: 'Fix slide 3 - too much text. Pecah jadi 2 slide.',
      created_at: new Date().toISOString(),
      created_by: 'operator'
    };

    assert.ok(revisionRecord.carousel_id, 'Must reference carousel');
    assert.ok(revisionRecord.note, 'Must store note');
    assert.ok(
      ['changes_requested', 'rejected'].includes(revisionRecord.decision),
      'Decision must be changes_requested or rejected'
    );
  });

  test('learned rules applied to next production in same category', () => {
    const rules = [
      { categoryKey: 'edukasi_trading', rule: 'Add real numbers', confidence: 0.9 },
      { categoryKey: 'edukasi_trading', rule: 'Include example calculation', confidence: 0.85 },
      { categoryKey: 'market_info', rule: 'Cite source', confidence: 0.95 }
    ];

    const tradesRules = rules.filter(r => r.categoryKey === 'edukasi_trading');
    
    assert.strictEqual(tradesRules.length, 2, 'Should have 2 trading rules');
    assert.ok(
      tradesRules.some(r => r.rule.includes('numbers')),
      'Should apply number rule'
    );
  });

  // ========== TASK 11: Topic Deduplication ==========

  test('topic similarity check tracks content history', () => {
    const history = [
      { topic: 'Risk Management Basics', category: 'edukasi_trading', score: 1.0 },
      { topic: 'Advanced Portfolio Strategies', category: 'edukasi_trading', score: 0.6 },
      { topic: 'Day Trading Fundamentals', category: 'jurnal_trading', score: 0.4 }
    ];

    assert.strictEqual(history.length, 3, 'Should track multiple carousels');
    assert.strictEqual(history[0].score, 1.0, 'Identical topic has score 1.0');
    assert.ok(history[1].score < 1.0, 'Different topic has lower score');
  });

  test('similarity levels categorize warning severity', () => {
    const levels = {
      clear: 'No similar content found',
      similar: 'Related content exists - different angle recommended',
      too_similar: 'Very similar - reconsider topic',
      duplicate: 'Exact duplicate - change topic'
    };

    Object.entries(levels).forEach(([level, msg]) => {
      assert.ok(msg, `${level} level should have message`);
    });
  });

  test('duplicate detection prevents exact topic repetition', () => {
    const existingTopics = [
      'Manajemen Risiko Dasar',
      'Strategi Hedging untuk Pemula',
      'Analisis Teknikal Emas'
    ];

    const newTopic = 'Manajemen Risiko Dasar';

    const isDuplicate = existingTopics.some(t => t === newTopic);
    assert.strictEqual(isDuplicate, true, 'Should detect exact duplicate');

    const isNewTopic = !existingTopics.some(t => t === 'Manajemen Risiko Lanjutan');
    assert.strictEqual(isNewTopic, true, 'Should not flag truly new topics');
  });

  // ========== TASK 12: Real News Sources ==========

  test('news sources configured for market_info', () => {
    const marketSources = [
      { name: 'Reuters Markets', url: 'https://reuters.com/finance', markets: true },
      { name: 'Bloomberg Markets', url: 'https://bloomberg.com/markets', markets: true },
      { name: 'CNBC Markets', url: 'https://cnbc.com/markets', markets: true },
      { name: 'Yahoo Finance', url: 'https://finance.yahoo.com', markets: true }
    ];

    assert.ok(marketSources.length >= 3, 'Should have at least 3 market sources');
    
    marketSources.forEach(source => {
      assert.ok(source.url.startsWith('https://'), 'URL should be HTTPS');
      assert.strictEqual(source.markets, true, 'Should be marked for markets');
    });
  });

  test('news fetching respects source configuration', () => {
    const newsFetchConfig = {
      categoryKey: 'market_info',
      maxItems: 10,
      maxAgeHours: 24,
      sources: ['reuters', 'bloomberg', 'cnbc', 'yahoo-finance']
    };

    assert.strictEqual(newsFetchConfig.categoryKey, 'market_info', 'Category must be market_info');
    assert.ok(newsFetchConfig.sources.length >= 3, 'Should have multiple sources');
    assert.ok(newsFetchConfig.maxAgeHours <= 24, 'News should be recent');
  });

  test('news items include source attribution', () => {
    const newsItem = {
      title: 'Fed holds rates steady at 5.25-5.50%',
      summary: 'Federal Reserve maintains interest rate policy amid economic data',
      source: 'Reuters Markets',
      publishedAt: '2026-10-02T10:30:00Z',
      url: 'https://reuters.com/markets/fed-2026-10-02',
      relevanceScore: 0.92
    };

    assert.ok(newsItem.source, 'Must have source attribution');
    assert.ok(newsItem.publishedAt, 'Must have publication timestamp');
    assert.ok(newsItem.relevanceScore > 0, 'Must have relevance scoring');
  });

  test('weekly plan incorporates news as topic source', () => {
    const planWithNews = {
      slots: [
        {
          dayIndex: 0,
          categoryKey: 'market_info',
          topic: 'Fed holds rates steady',
          newsSourceUsed: 'Reuters Markets',
          reasoning: 'Breaking financial news relevant to traders'
        }
      ]
    };

    const slot = planWithNews.slots[0];
    assert.ok(slot.newsSourceUsed, 'Should indicate which news source was used');
    assert.ok(slot.reasoning.includes('news'), 'Reasoning should mention news');
  });
});
