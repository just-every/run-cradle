// Worker options for the emitted-Worker test runtimes. Producers always stay so code that enqueues
// still works; Miniflare's real queue consumer starts only when a runtime asks for it (`automatic`)
// or the run sets CRADLE_TEST_QUEUE_CONSUMERS=1, because a job a test leaves on the queue is then
// delivered mid-test (gr-base-215).
export function queueConsumerOptions(automatic = process.env.CRADLE_TEST_QUEUE_CONSUMERS === '1') {
  return automatic ? {} : { queueConsumers: {} }
}
