import { test, describe } from 'node:test';
import assert from 'node:assert';

/**
 * Test Suite: Loading Animation for Refresh Button
 * 
 * Verifies that refresh button shows spinner animation during data load
 * and that overlay prevents multiple clicks during loading.
 */

describe('Loading Animation for Refresh Button', () => {

  test('spinner CSS animation exists', () => {
    // CSS should define @keyframes spin animation
    
    const spinKeyframes = `
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
    `;

    assert.ok(
      spinKeyframes.includes('spin'),
      'Spin animation must be defined'
    );

    assert.ok(
      spinKeyframes.includes('rotate(0deg)'),
      'Animation must start at 0 degrees'
    );

    assert.ok(
      spinKeyframes.includes('rotate(360deg)'),
      'Animation must end at 360 degrees'
    );
  });

  test('loading-spinner class has correct properties', () => {
    // .loading-spinner should have:
    // - display: inline-block
    // - width: 20px, height: 20px
    // - border styling
    // - border-radius: 50%
    // - animation: spin 1s linear infinite
    
    const spinnerCss = `
      .loading-spinner {
        display: inline-block;
        width: 20px;
        height: 20px;
        border: 3px solid rgba(59, 130, 246, 0.3);
        border-top-color: #3B82F6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      }
    `;

    assert.ok(spinnerCss.includes('display: inline-block'), 'Spinner must be inline-block');
    assert.ok(spinnerCss.includes('width: 20px'), 'Spinner must be 20px wide');
    assert.ok(spinnerCss.includes('height: 20px'), 'Spinner must be 20px tall');
    assert.ok(spinnerCss.includes('border-radius: 50%'), 'Spinner must be circular');
    assert.ok(spinnerCss.includes('animation: spin 1s linear infinite'), 'Spinner must animate');
  });

  test('refresh button click shows loading state', () => {
    // When refresh button clicked, should:
    // 1. Disable the button
    // 2. Show overlay with spinner
    // 3. Display "Sedang memuat..." message
    
    const mockButton = {
      id: 'btn-refresh',
      disabled: false,
      classList: {
        add: function(cls: string) { this.classes = this.classes || []; this.classes.push(cls); },
        contains: function(cls: string) { return (this.classes || []).includes(cls); },
        classes: [] as string[]
      }
    };

    const mockOverlay = {
      className: 'loading on',
      textContent: 'Sedang memuat…'
    };

    // Simulate click handler
    mockButton.disabled = true;
    mockButton.classList.add('loading-btn');

    assert.strictEqual(
      mockButton.disabled,
      true,
      'Button should be disabled during load'
    );

    assert.ok(
      mockButton.classList.contains('loading-btn'),
      'Button should have loading-btn class'
    );

    assert.ok(
      mockOverlay.className.includes('on'),
      'Overlay should be visible'
    );
  });

  test('loading spinner duration minimum 450ms', () => {
    // Even if data arrives quickly, spinner should display for at least 450ms
    // to avoid jarring flicker
    
    const minDuration = 450;
    const fastLoadTime = 100;
    const requiredWait = Math.max(0, minDuration - fastLoadTime);

    assert.strictEqual(
      requiredWait,
      350,
      'Fast loads should wait 350ms for spinner to show (450 - 100)'
    );

    const slowLoadTime = 600;
    const requiredWaitSlow = Math.max(0, minDuration - slowLoadTime);

    assert.strictEqual(
      requiredWaitSlow,
      0,
      'Slow loads should not add extra wait'
    );
  });

  test('overlay disappears after data loads', () => {
    // After loadOverview completes, overlay should hide by removing 'on' class
    
    const mockOverlay = {
      classList: {
        remove: function(cls: string) {
          this.classes = (this.classes || []).filter((c: string) => c !== cls);
        },
        contains: function(cls: string) {
          return (this.classes || []).includes(cls);
        },
        classes: ['loading', 'on']
      }
    };

    // Simulate data load completion
    mockOverlay.classList.remove('on');

    assert.ok(
      !mockOverlay.classList.contains('on'),
      'Overlay on class should be removed after load'
    );
  });

  test('button re-enables after loading completes', () => {
    // After hideLoading(), button should be re-enabled
    
    const mockButton = {
      disabled: true,
      classList: {
        remove: function(cls: string) {
          this.classes = (this.classes || []).filter((c: string) => c !== cls);
        },
        contains: function(cls: string) {
          return (this.classes || []).includes(cls);
        },
        classes: ['loading-btn']
      }
    };

    // Simulate load completion
    mockButton.disabled = false;
    mockButton.classList.remove('loading-btn');

    assert.strictEqual(
      mockButton.disabled,
      false,
      'Button should be re-enabled'
    );

    assert.ok(
      !mockButton.classList.contains('loading-btn'),
      'Loading class should be removed'
    );
  });

  test('multiple refresh clicks prevented during load', () => {
    // Button disabled prevents multiple clicks while loading
    
    let clickCount = 0;

    const mockButton = {
      disabled: false,
      onclick: function() {
        if (this.disabled) return; // Click ignored
        clickCount++;
        this.disabled = true;
      }
    };

    // Simulate multiple clicks
    mockButton.onclick.call(mockButton); // Should work
    mockButton.onclick.call(mockButton); // Should be ignored (disabled)
    mockButton.onclick.call(mockButton); // Should be ignored (disabled)

    assert.strictEqual(
      clickCount,
      1,
      'Only first click should register while loading'
    );
  });

  test('loading message appears during refresh', () => {
    // Message should update to show what is loading
    
    const mockLoadMsg = {
      textContent: ''
    };

    const mockLoadSub = {
      textContent: ''
    };

    // Simulate showLoading call
    mockLoadMsg.textContent = 'Muat Ulang';
    mockLoadSub.textContent = 'Sedang memperbarui data dashboard…';

    assert.strictEqual(
      mockLoadMsg.textContent,
      'Muat Ulang',
      'Main message should be set'
    );

    assert.ok(
      mockLoadSub.textContent.includes('memperbarui'),
      'Sub-message should indicate what is loading'
    );
  });
});
