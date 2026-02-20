const path = require('path');
const cstesting = (() => {
  try { return require('cstesting'); } catch { return require(path.join(__dirname, '..')); }
})();
const { describe, it, expect, request } = cstesting;

const BASE = 'https://jsonplaceholder.typicode.com';

describe('API testing – request methods', () => {
  it('GET – fluent expectStatus, expectHeader, expectJson', async () => {
    const res = await request.get(`${BASE}/users/1`);
    res.expectStatus(200)
      .expectHeader('content-type', /json/)
      .expectJson('id', 1)
      .expectJson('name', 'Leanne Graham');
  });

  it('GET – getResponse() and expect()', async () => {
    const res = await request.get(`${BASE}/users/2`);
    res.expectStatus(200);
    const r = res.getResponse();
    expect(r.status).toBe(200);
    expect(r.body).toBeDefined();
    expect(r.body.email).toContain('@');
  });

  it('POST – with body, expectStatus 201', async () => {
    const res = await request.post(`${BASE}/posts`, { title: 'Foo', body: 'Bar', userId: 1 });
    res.expectStatus(201);
  });

  it('POST – expectBody / expectJson on created resource', async () => {
    const res = await request.post(`${BASE}/posts`, { title: 'Test', body: 'Content', userId: 1 });
    res.expectStatus(201).expectJson('title', 'Test').expectJson('userId', 1);
  });

  it('PUT – with body, expectStatus 200', async () => {
    const res = await request.put(`${BASE}/posts/1`, { id: 1, title: 'Updated', body: 'Updated body', userId: 1 });
    res.expectStatus(200);
  });

  it('PATCH – with body, expectStatus 200', async () => {
    const res = await request.patch(`${BASE}/posts/1`, { title: 'Patched title' });
    res.expectStatus(200);
  });

  it('DELETE – expectStatus 200', async () => {
    const res = await request.delete(`${BASE}/posts/1`);
    res.expectStatus(200);
  });
});

describe('API testing – verifyStatus (single function, all methods)', () => {
  it('verifyStatus GET', async () => {
    await request.verifyStatus('GET', `${BASE}/users/1`, 200);
  });

  it('verifyStatus POST with body', async () => {
    await request.verifyStatus('POST', `${BASE}/posts`, 201, { title: 'x', body: 'y', userId: 1 });
  });

  it('verifyStatus PUT with body', async () => {
    await request.verifyStatus('PUT', `${BASE}/posts/1`, 200, { id: 1, title: 'a', body: 'b', userId: 1 });
  });

  it('verifyStatus PATCH with body', async () => {
    await request.verifyStatus('PATCH', `${BASE}/posts/1`, 200, { title: 'patched' });
  });

  it('verifyStatus DELETE', async () => {
    await request.verifyStatus('DELETE', `${BASE}/posts/1`, 200);
  });
});

describe('API testing – raw request()', () => {
  it('request() returns ApiResponse, assert with expect()', async () => {
    const res = await request.request('GET', `${BASE}/users/3`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBeDefined();
    expect(res.body).toBeDefined();
    expect(res.body.username).toBeDefined();
  });
});
