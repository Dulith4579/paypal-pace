// scratch/health_check.ts
// Health check for PayPal Pace project – runs classification, pacing, and agent fallback.

(async () => {
  // Dynamically import required modules without .ts extensions
  const { classifyPurchase, calculatePacing } = await import('../src/lib/pacing');
  const { POST } = await import('../src/app/api/agent/route');
  const { mockMilestones } = await import('../src/lib/mock-data');

  console.log('--- Classification Test ---');
  const classification = classifyPurchase('MacBook Air M3 Dev Workstation');
  console.log('Result:', classification);

  console.log('\n--- Pacing Calculation Test (high-utility expense paused) ---');
  const expenseItems = [
    { expense_id: 'exp-001', name: 'MacBook Air M3 Dev Workstation', amount: 1099, description: 'High utility laptop', paused: true },
    { expense_id: 'exp-002', name: 'Gym Membership', amount: 45, description: 'Health', paused: false },
  ];
  const pacingResult = calculatePacing(1099, expenseItems, mockMilestones, 'MacBook Air M3 Dev Workstation');
  console.log('Confidence score:', pacingResult.intelligence.confidence_score);
  console.log('Levers:', pacingResult.intelligence.levers.map((l:any) => l.lever));

  console.log('\n--- Agent Route Fallback Test (Ollama offline simulation)---');
  const mockRequest = {
    json: async () => ({
      prompt: 'Justify purchasing MacBook Air M3 Dev Workstation for $1099',
      productName: 'MacBook Air M3 Dev Workstation',
      purchaseAmount: 1099,
      expenses: expenseItems.map(e => ({ expense_id: e.expense_id, name: e.name, amount: e.amount, paused: e.paused })),
    })
  } as any;
  const resp = await POST(mockRequest);
  const data = await resp.json();
  console.log('Agent response source:', data.source);
  console.log('Justification snippet:', (data.justification || '').substring(0, 200));
  console.log('Levers returned:', data.levers?.map((l:any) => l.lever));
  console.log('Confidence score returned:', data.confidence_score);
})();
