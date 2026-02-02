/**
 * P1-7: errorHandler 500 错误响应测试
 * 验证 dev/prod 模式下的错误消息行为
 *
 * 运行方式: node test-error-handler.js
 */
import express from 'express';
import { errorHandler } from './middleware/error.middleware.js';

const TEST_PORT = 9527;

const createTestApp = (errorRoute) => {
  const app = express();
  app.use(express.json());
  app.get('/api/test-error', errorRoute);
  app.use(errorHandler);
  return app;
};

const runTests = async () => {
  const results = [];
  let server;

  const request = async (path) => {
    const res = await fetch(`http://localhost:${TEST_PORT}${path}`);
    const body = await res.json();
    return { status: res.status, body };
  };

  // Test 1: Dev 模式返回具体 message
  console.log('\n[Test 1] Dev mode - should return specific error message');
  {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const testMessage = 'Database connection failed';
    const app = createTestApp((req, res, next) => {
      const err = new Error(testMessage);
      err.status = 500;
      next(err);
    });

    server = app.listen(TEST_PORT);
    await new Promise((r) => setTimeout(r, 100));

    const { status, body } = await request('/api/test-error');
    const passed = status === 500 && body.error === testMessage;

    results.push({
      name: 'Dev mode returns specific message',
      passed,
      expected: { status: 500, error: testMessage },
      actual: { status, error: body.error }
    });

    console.log(passed ? '  ✓ PASS' : '  ✗ FAIL');
    console.log(`    Expected: ${testMessage}`);
    console.log(`    Actual:   ${body.error}`);

    server.close();
    process.env.NODE_ENV = originalEnv;
  }

  // Test 2: Prod 模式返回 Internal Server Error
  console.log('\n[Test 2] Prod mode - should return generic error message');
  {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const testMessage = 'Sensitive database error details';
    const app = createTestApp((req, res, next) => {
      const err = new Error(testMessage);
      err.status = 500;
      next(err);
    });

    server = app.listen(TEST_PORT);
    await new Promise((r) => setTimeout(r, 100));

    const { status, body } = await request('/api/test-error');
    const passed = status === 500 && body.error === 'Internal Server Error';

    results.push({
      name: 'Prod mode returns generic message',
      passed,
      expected: { status: 500, error: 'Internal Server Error' },
      actual: { status, error: body.error }
    });

    console.log(passed ? '  ✓ PASS' : '  ✗ FAIL');
    console.log(`    Expected: Internal Server Error`);
    console.log(`    Actual:   ${body.error}`);

    server.close();
    process.env.NODE_ENV = originalEnv;
  }

  // Test 3: Prod 模式下 4xx 错误仍返回具体 message
  console.log('\n[Test 3] Prod mode - 4xx errors should still return specific message');
  {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const testMessage = 'Invalid request format';
    const app = createTestApp((req, res, next) => {
      const err = new Error(testMessage);
      err.status = 400;
      next(err);
    });

    server = app.listen(TEST_PORT);
    await new Promise((r) => setTimeout(r, 100));

    const { status, body } = await request('/api/test-error');
    const passed = status === 400 && body.error === testMessage;

    results.push({
      name: 'Prod mode 4xx returns specific message',
      passed,
      expected: { status: 400, error: testMessage },
      actual: { status, error: body.error }
    });

    console.log(passed ? '  ✓ PASS' : '  ✗ FAIL');
    console.log(`    Expected: ${testMessage}`);
    console.log(`    Actual:   ${body.error}`);

    server.close();
    process.env.NODE_ENV = originalEnv;
  }

  // Test 4: 无 message 时的默认行为
  console.log('\n[Test 4] Error without message - should fallback to default');
  {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';

    const app = createTestApp((req, res, next) => {
      const err = new Error();
      err.status = 500;
      next(err);
    });

    server = app.listen(TEST_PORT);
    await new Promise((r) => setTimeout(r, 100));

    const { status, body } = await request('/api/test-error');
    const passed = status === 500 && body.error === 'Internal Server Error';

    results.push({
      name: 'Empty message fallback',
      passed,
      expected: { status: 500, error: 'Internal Server Error' },
      actual: { status, error: body.error }
    });

    console.log(passed ? '  ✓ PASS' : '  ✗ FAIL');
    console.log(`    Expected: Internal Server Error`);
    console.log(`    Actual:   ${body.error}`);

    server.close();
    process.env.NODE_ENV = originalEnv;
  }

  // Summary
  console.log('\n========== Test Summary ==========');
  const passedCount = results.filter((r) => r.passed).length;
  console.log(`Total: ${results.length}, Passed: ${passedCount}, Failed: ${results.length - passedCount}`);

  results.forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.passed ? '✓' : '✗'} ${r.name}`);
  });

  const allPassed = results.every((r) => r.passed);
  console.log(`\nOverall: ${allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'}`);

  process.exit(allPassed ? 0 : 1);
};

runTests().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
