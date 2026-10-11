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
  mock.rows=[{ id:'candidate',source_url:existing.sources[0].url,payload:{...emptyConcert(),title:'Updated official title',starts_on:'2099-11-07'},previous_payload:null,revision:2,status:'pending',fetched_at:'2026-10-07T00:00:00Z' }]
  const onSelect=vi.fn()
  mock.rpc.mockResolvedValue({error:{message:'EDIT_CONFLICT'}})
  render(<CollectionPanel catalog={{concerts:[existing],bands:[],history:[]}} onSelect={onSelect} />)
  fireEvent.click(await screen.findByRole('button',{name:'검수 입력에 반영'}))
  expect(onSelect.mock.calls[0][0]).toMatchObject({id:'existing',updated_at:'version',title:'Updated official title',announcement_verified:true,announced_on:'2025-07-07',band_ids:['mcr'],ticket:{id:'ticket'}})
  fireEvent.click(screen.getByRole('button',{name:'검수 완료 표시'}))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('다른 관리자가 수정했습니다'))
  expect(mock.rpc).toHaveBeenCalledWith('admin_resolve_candidate',{candidate_id:'candidate',expected_revision:2,resolution:'reviewed'})
})

test('review starts with upcoming dates and preserves unknown artist names in separate date groups', async () => {
  mock.rows = [
    { id:'future',source_url:'https://ticket.yes24.com/Perf/1',payload:{...emptyConcert(),title:'Future',starts_on:'2099-01-01',discovered_artists:[{name:'Unknown band',source_url:'https://ticket.yes24.com/Perf/1',reason:'신원 확인 필요'}]},revision:1 },
    { id:'unknown',source_url:'https://radwimps.jp/live/1/',payload:{...emptyConcert(),title:'Unknown date'},revision:1 },
    { id:'past',source_url:'https://ticket.yes24.com/Perf/2',payload:{...emptyConcert(),title:'Past',starts_on:'2000-01-01'},revision:1 },
  ]
  render(<CollectionPanel catalog={{concerts:[],bands:[],history:[]}} onSelect={vi.fn()} />)
  await screen.findByText('Future')
  expect(screen.getByText(/Unknown band/)).toBeTruthy()
  expect(screen.queryByText('Past')).toBeNull()
  expect(screen.queryByText('Unknown date')).toBeNull()
  fireEvent.change(screen.getByLabelText('후보 일정'),{target:{value:'unknown'}})
  expect(screen.getByText('Unknown date')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('후보 일정'),{target:{value:'past'}})
  expect(screen.getByText('Past')).toBeTruthy()
})
