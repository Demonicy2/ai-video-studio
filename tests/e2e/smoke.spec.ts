import { test, expect } from '@playwright/test';

test.describe('AI Video Studio E2E Smoke Test', () => {
  test('create project -> storyboard (mock) -> generate (mock) -> result page shows video element', async ({
    page,
  }) => {
    await page.goto('/');

    // 1. Quick sign-in with Demo Account
    await page.getByTestId('demo-login-btn').click();
    await expect(page.getByTestId('dashboard-screen')).toBeVisible();

    // 2. Open 3-step New Project Wizard
    await page.getByTestId('nav-new-project-btn').click();
    await expect(page.getByTestId('wizard-step-1')).toBeVisible();

    await page
      .getByTestId('wizard-title-input')
      .fill('Hành trình Mèo Máy Sài Gòn 2099');
    await page
      .getByTestId('wizard-source-input')
      .fill('Một chú mèo máy thông minh bay qua những tòa tháp rực sáng đèn neon tại Sài Gòn.');

    await page.getByTestId('wizard-next-1').click();
    await expect(page.getByTestId('wizard-step-2')).toBeVisible();

    await page.getByTestId('wizard-next-2').click();
    await expect(page.getByTestId('wizard-step-3')).toBeVisible();

    // 3. Create Storyboard (Mock LLM)
    await page.getByTestId('create-storyboard-btn').click();

    // Wait for Storyboard Editor to appear with generated scenes
    await expect(page.getByTestId('storyboard-editor')).toBeVisible({ timeout: 15000 });
    await expect(page.getByTestId('scene-editor-card-0')).toBeVisible();

    // 4. Approve & Generate Video (Mock Video + Mock TTS + FFmpeg Assembly)
    await page.getByTestId('approve-generate-btn').click();

    // 5. Wait for Result Page with <video> element
    const videoEl = page.getByTestId('final-video-player');
    await expect(videoEl).toBeVisible({ timeout: 25000 });
    const videoSrc = await videoEl.getAttribute('src');
    expect(videoSrc).toMatch(/^\/api\/storage\/projects\/.*\/final_.*\.mp4$/);
  });
});

