import { assertEquals } from 'jsr:@std/assert@1';
import { encodeSSE, parseAITutorRequest } from '../_shared/ai-tutor-contract.ts';

Deno.test('accepts a bounded, user-terminated tutor request', () => {
  const result = parseAITutorRequest({ messages: [{ role: 'user', content: '  اشرح الكسور  ' }], context: { mode: 'explain', grade: 'الصف الرابع' } });
  assertEquals(result?.messages[0].content, 'اشرح الكسور');
  assertEquals(result?.context?.mode, 'explain');
});

Deno.test('rejects an assistant-terminated request and unknown mode', () => {
  assertEquals(parseAITutorRequest({ messages: [{ role: 'assistant', content: 'مرحباً' }] }), null);
  assertEquals(parseAITutorRequest({ messages: [{ role: 'user', content: 'سؤال' }], context: { mode: 'unsafe' } })?.context?.mode, undefined);
});

Deno.test('encodes named SSE events', () => {
  assertEquals(new TextDecoder().decode(encodeSSE({ type: 'delta', text: 'أهلاً' })), 'event: delta\ndata: {"type":"delta","text":"أهلاً"}\n\n');
});
