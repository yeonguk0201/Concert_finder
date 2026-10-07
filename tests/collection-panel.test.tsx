// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { CollectionPanel } from '../src/CollectionPanel'
import { emptyConcert } from '../src/adminApi'
const mock = vi.hoisted(() => ({ rows: [] as unknown[], rpc: vi.fn() }))
vi.mock('../src/backend', () => ({ backend: { rpc: mock.rpc, from: () => ({ select: () => ({ eq: () => ({ order: async () => ({ data:mock.rows,error:null }) }), order: () => ({ limit: async () => ({ data:[],error:null }) }) }) }) } }))
afterEach(() => { cleanup(); vi.resetAllMocks(); mock.rows = [] })
test('candidate review reuses official source identity, preserves verified fields and reports resolution conflicts', async () => {
  const existing={ ...emptyConcert(), id:'existing', title:'Old', updated_at:'version', announcement_verified:true, announced_on:'2025-07-07', band_ids:['mcr'], sources:[{url:'https://ualive.com/concerts/397',label:'Official',verified_at:'2026-10-06T00:00:00Z'}],ticket:{id:'ticket',opens_at:'2025-07-14T03:00:00Z',booking_url:null,price_description:null} }
  mock.rows=[{ id:'candidate',source_url:existing.sources[0].url,payload:{...emptyConcert(),title:'Updated official title',starts_on:'2026-11-07'},previous_payload:null,revision:2,status:'pending',fetched_at:'2026-10-07T00:00:00Z' }]
  const onSelect=vi.fn()
  mock.rpc.mockResolvedValue({error:{message:'EDIT_CONFLICT'}})
  render(<CollectionPanel catalog={{concerts:[existing],bands:[],history:[]}} onSelect={onSelect} />)
  fireEvent.click(await screen.findByRole('button',{name:'검수 입력에 반영'}))
  expect(onSelect.mock.calls[0][0]).toMatchObject({id:'existing',updated_at:'version',title:'Updated official title',announcement_verified:true,announced_on:'2025-07-07',band_ids:['mcr'],ticket:{id:'ticket'}})
  fireEvent.click(screen.getByRole('button',{name:'검수 완료 표시'}))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('다른 관리자가 수정했습니다'))
  expect(mock.rpc).toHaveBeenCalledWith('admin_resolve_candidate',{candidate_id:'candidate',expected_revision:2,resolution:'reviewed'})
})
