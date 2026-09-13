/// <reference types="node" />
// @vitest-environment jsdom

import { readFileSync } from 'node:fs'
import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as geometry from '../data/geometry'
import type { RegionPackId } from '../data/regions'
import { RegionPackMap } from './RegionPackMap'
import { RegionPicker } from './RegionPicker'
import { SeoulDistrictMap } from './SeoulDistrictMap'

const styles = readFileSync('src/App.css', 'utf8')

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function PickerFixture() {
  const [pack, setPack] = useState<RegionPackId>('gyeonggi')
  const [selected, setSelected] = useState<string>()
  const [started, setStarted] = useState<string>()
  return <>
    <RegionPicker selectedPackId={pack} selectedRegionId={selected} onPackChange={setPack} onRegionSelect={setSelected} onStart={setStarted} />
    {started ? <output>시작: {started}</output> : null}
  </>
}

describe('RegionPackMap', () => {
  it('경기 개요는 실제 시군 경계 31개만 선택할 수 있고 Enter와 Space를 지원한다', async () => {
    const selected: string[] = []
    const { container } = render(<RegionPackMap packId="gyeonggi" detail="overview" interactive onRegionSelect={(id) => selected.push(id)} />)
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    const buttons = within(map).getAllByRole('button')
    expect(buttons).toHaveLength(31)
    expect(container.querySelector('[data-region-id="gyeonggi:seongnam:bundang"]')).toBeNull()
    const suwon = within(map).getByRole('button', { name: /^수원시/u })
    suwon.focus()
    expect(document.activeElement).toBe(suwon)
    fireEvent.keyDown(suwon, { key: 'Enter' })
    fireEvent.keyDown(suwon, { key: ' ' })
    fireEvent.keyDown(suwon, { key: 'Escape' })
    expect(selected).toEqual(['gyeonggi:suwon', 'gyeonggi:suwon'])
    expect(suwon.getAttribute('aria-pressed')).toBe('true')
    expect(map.getAttribute('viewBox')).toBe('0 0 1000 1000')
    expect(suwon.querySelector('.district-shape')?.getAttribute('d')?.length).toBeGreaterThan(100)
  })

  it.each([
    ['gyeonggi:suwon', '수원시', ['장안구', '권선구', '팔달구', '영통구']],
    ['gyeonggi:seongnam', '성남시', ['수정구', '중원구', '분당구']],
    ['gyeonggi:yongin', '용인시', ['처인구', '기흥구', '수지구']],
  ] as const)('세부 지도는 %s에 속한 구만 표시한다', async (parentRegionId, name, districts) => {
    render(<RegionPackMap packId="gyeonggi" detail={{ parentRegionId }} interactive />)
    const map = await screen.findByRole('group', { name: `${name} 세부 구 지도` })
    expect(new Set(within(map).getAllByRole('button').map((button) => button.getAttribute('aria-label')))).toEqual(new Set(districts))
  })

  it('문제·선택·맞힌 지역·인접·정오답을 색상 외의 캡션과 이름으로 전달한다', async () => {
    render(<RegionPackMap packId="gyeonggi" activeRegionId="gyeonggi:seongnam" selectedRegionId="gyeonggi:suwon" solvedRegionIds={['gyeonggi:yongin']} adjacentRegionIds={['gyeonggi:gwacheon']} result={{ correct: false, answer: '수원시' }} interactive />)
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    expect(within(map).getByRole('button', { name: /성남시, 문제 지역/u })).toBeTruthy()
    expect(within(map).getByRole('button', { name: /과천시, 인접 지역/u })).toBeTruthy()
    const caption = screen.getByText(/오답이에요\. 정답 지역: 성남시/u).closest('figcaption')
    expect(caption?.getAttribute('aria-live')).toBe('polite')
    expect(caption?.textContent).toContain('선택한 지역: 수원시')
    expect(caption?.textContent).toContain('맞힌 지역: 용인시')
    expect(caption?.textContent).toContain('인접 지역: 과천시')
  })

  it('이미 맞힌 지역이 다시 문제로 나오면 문제 강조색을 유지한다', async () => {
    render(<><style>{styles}</style><RegionPackMap packId="gyeonggi" activeRegionId="gyeonggi:seongnam" solvedRegionIds={['gyeonggi:seongnam']} /></>)
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    const path = within(map).getByRole('button', { name: /^성남시/u }).querySelector('.district-shape')!
    expect(getComputedStyle(path).fill).toBe('var(--brand-primary)')
  })

  it('이미 맞힌 문제 지역에 오답 결과가 나오면 과거 성공색 대신 오답 상태를 표시한다', async () => {
    const props = { packId: 'gyeonggi' as const, activeRegionId: 'gyeonggi:seongnam', solvedRegionIds: ['gyeonggi:seongnam'] }
    const { rerender } = render(<><style>{styles}</style><RegionPackMap {...props} /></>)
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    rerender(<><style>{styles}</style><RegionPackMap {...props} result={{ correct: false, answer: '수원시' }} /></>)
    const region = within(map).getByRole('button', { name: /^성남시/u })
    expect(region.classList.contains('district--incorrect')).toBe(true)
    // Mutually exclusive visual states avoid specificity-dependent success fill.
    // The historical solved state remains available in the accessible name.
    expect(region.classList.contains('district--solved')).toBe(false)
    expect(region.getAttribute('aria-label')).toContain('맞힌 지역')
    expect(getComputedStyle(region.querySelector('.district-shape')!).fill).toBe('var(--answer-incorrect)')
  })

  it('부모가 같은 팩에서 선택을 해제하면 강조·눌림·선택 안내도 해제한다', async () => {
    function ControlledMap() {
      const [selected, setSelected] = useState<string>()
      return <>
        <RegionPackMap packId="gyeonggi" selectedRegionId={selected} onRegionSelect={setSelected} />
        <button type="button" onClick={() => setSelected(undefined)}>선택 해제</button>
      </>
    }
    render(<ControlledMap />)
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    const region = within(map).getByRole('button', { name: /^수원시/u })
    fireEvent.click(region)
    expect(region.getAttribute('aria-pressed')).toBe('true')
    expect(region.classList.contains('district--selected')).toBe(true)
    expect(screen.getByText(/선택한 지역: 수원시/u)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '선택 해제' }))
    expect(region.getAttribute('aria-pressed')).toBe('false')
    expect(region.classList.contains('district--selected')).toBe(false)
    expect(screen.queryByText(/선택한 지역:/u)).toBeNull()
    expect(map.querySelector('[aria-pressed="true"]')).toBeNull()
  })

  it('불러오기 실패 시 목록 검색으로 선택할 수 있고 재시도로 지도를 복구한다', async () => {
    vi.spyOn(geometry, 'loadGeometry').mockRejectedValueOnce(new Error('unavailable'))
    const selected: string[] = []
    const failedPacks: string[] = []
    render(<><style>{styles}</style><RegionPackMap packId="gyeonggi" interactive onRegionSelect={(id) => selected.push(id)} onMapLoadFailed={(packId) => failedPacks.push(packId)} /></>)
    await screen.findByRole('alert')
    expect(failedPacks).toEqual(['gyeonggi'])
    fireEvent.change(screen.getByRole('searchbox', { name: '지역명 검색' }), { target: { value: '성 남' } })
    const option = screen.getByRole('button', { name: /^성남시/u })
    expect(Number.parseFloat(getComputedStyle(option).minHeight)).toBeGreaterThanOrEqual(44)
    expect(Number.parseFloat(getComputedStyle(option).minWidth)).toBeGreaterThanOrEqual(44)
    fireEvent.click(option)
    expect(selected).toEqual(['gyeonggi:seongnam'])
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(await screen.findByRole('group', { name: '경기 31개 시·군 지도' })).toBeTruthy()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('목록을 숨긴 지도도 불러오기가 실패한 동안에만 대체 목록을 제공한다', async () => {
    vi.spyOn(geometry, 'loadGeometry').mockRejectedValueOnce(new Error('unavailable'))
    render(<RegionPackMap packId="gyeonggi" interactive showRegionList={false} />)

    await screen.findByRole('alert')
    expect(screen.getByText('지역 목록에서 선택')).toBeTruthy()
    expect(screen.getByRole('searchbox', { name: '지역명 검색' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    expect(screen.queryByText('지역 목록에서 선택')).toBeNull()
    expect(screen.queryByRole('searchbox', { name: '지역명 검색' })).toBeNull()
  })

  it('지도 재시도에서 실패한 요청마다 실패 콜백을 한 번씩만 알린다', async () => {
    vi.spyOn(geometry, 'loadGeometry').mockRejectedValue(new Error('unavailable'))
    const failedPacks: string[] = []
    render(<RegionPackMap packId="gyeonggi" interactive onMapLoadFailed={(packId) => failedPacks.push(packId)} />)

    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: '다시 불러오기' }))
    await waitFor(() => expect(failedPacks).toEqual(['gyeonggi', 'gyeonggi']))
  })

  it('로딩 중에도 목록을 사용할 수 있고 이전 지역팩의 늦은 응답을 무시한다', async () => {
    let resolve!: (manifest: geometry.GeometryManifest) => void
    const manifest = await geometry.loadGeometry('gyeonggi', false)
    vi.spyOn(geometry, 'loadGeometry').mockImplementationOnce(() => new Promise((done) => { resolve = done }))
    const svg = readFileSync('public/seoul-district.svg', 'utf8')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
    const { rerender } = render(<RegionPackMap packId="gyeonggi" interactive />)
    expect(screen.getByRole('status').textContent).toContain('불러오는 중')
    expect(screen.getByRole('searchbox')).toBeTruthy()
    rerender(<RegionPackMap packId="seoul" interactive />)
    await screen.findByRole('group', { name: '서울 25개 자치구 지도' })
    await act(async () => resolve(manifest))
    expect(screen.queryByRole('group', { name: '경기 31개 시·군 지도' })).toBeNull()
    expect(within(screen.getByRole('group', { name: '서울 25개 자치구 지도' })).getAllByRole('button')).toHaveLength(25)
  })

  it('비대화형 지도는 탭 정지점이나 선택 이벤트를 만들지 않는다', async () => {
    const selected: string[] = []
    render(<RegionPackMap packId="gyeonggi" interactive={false} onRegionSelect={(id) => selected.push(id)} />)
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    expect(within(map).queryAllByRole('button')).toHaveLength(0)
    fireEvent.click(map.querySelector('[data-region-id="gyeonggi:suwon"]')!)
    expect(selected).toEqual([])
    expect(map.querySelector('[tabindex]')).toBeNull()
  })

  it('서울 호환 wrapper는 이름 기반 선택과 준비 알림·타자 라벨·출처를 보존한다', async () => {
    const svg = readFileSync('public/seoul-district.svg', 'utf8')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
    const selected: string[] = []
    let ready = 0
    const props = { activeDistrict: '마포구', result: null, solvedDistricts: ['종로구'], onDistrictSelect: (name: string) => selected.push(name), onReady: () => { ready += 1 } }
    const { rerender, container } = render(<SeoulDistrictMap {...props} />)
    const map = await screen.findByRole('group', { name: '서울 25개 자치구 지도' })
    expect(within(map).getByRole('button', { name: /^마포구/u }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(map).getByRole('button', { name: /^영등포구/u }))
    expect(selected).toEqual(['영등포구'])
    expect(ready).toBe(1)
    expect(screen.getByText(/Kurykh · CC BY-SA 3.0/u)).toBeTruthy()
    rerender(<SeoulDistrictMap {...props} variant="typing" interactive={false} />)
    await waitFor(() => expect(container.querySelector('.district-label')?.textContent).toBe('종로구'))
    expect(screen.getByText(/1개 자치구를 맞혔어요/u)).toBeTruthy()
    rerender(<SeoulDistrictMap {...props} result={{ correct: true, answer: '마포구' }} />)
    expect(container.querySelector('.district--correct')?.getAttribute('data-region-id')).toBe('seoul:mapo')
  })
})

describe('RegionPicker', () => {
  it('검색으로 지역을 골라 코스를 시작하며 세 도시만 세부 코스로 표시한다', async () => {
    render(<PickerFixture />)
    await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    expect(screen.getByRole('tab', { name: '경기' }).getAttribute('aria-selected')).toBe('true')
    expect(screen.getAllByText('세부 코스')).toHaveLength(3)
    expect((screen.getByRole('button', { name: '지역을 선택해 주세요' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('searchbox', { name: '지역명 검색' }), { target: { value: '성남' } })
    const list = screen.getByRole('list', { name: '지역 목록' })
    expect(within(list).getAllByRole('button')).toHaveLength(1)
    fireEvent.click(within(list).getByRole('button', { name: /^성남시/u }))
    fireEvent.click(screen.getByRole('button', { name: '성남시 5문제 시작' }))
    expect(screen.getByText('시작: gyeonggi:seongnam')).toBeTruthy()
  })

  it('팩 전환은 검색을 초기화하고 이전 팩 선택을 시작 대상으로 사용하지 않는다', async () => {
    const svg = readFileSync('public/seoul-district.svg', 'utf8')
    vi.stubGlobal('fetch', vi.fn(async () => new Response(svg)))
    render(<PickerFixture />)
    const map = await screen.findByRole('group', { name: '경기 31개 시·군 지도' })
    fireEvent.click(within(map).getByRole('button', { name: /^수원시/u }))
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '수원' } })
    fireEvent.click(screen.getByRole('tab', { name: '서울' }))
    await screen.findByRole('group', { name: '서울 25개 자치구 지도' })
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('button', { name: '지역을 선택해 주세요' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '없는 지역' } })
    expect(screen.getByText(/검색한 지역이 없어요/u)).toBeTruthy()
  })
})
