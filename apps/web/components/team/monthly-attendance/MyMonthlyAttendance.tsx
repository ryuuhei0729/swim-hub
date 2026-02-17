'use client'

import React, { useState, useEffect, useMemo, useRef } from 'react'
import { useAuth } from '@/contexts'
import { AttendanceAPI } from '@swim-hub/shared/api/attendance'
import { TeamAttendancesAPI } from '@apps/shared/api/teams/attendances'
import { TeamEvent } from '@swim-hub/shared/types'
import { MonthList } from './components/MonthList'
import { RecentAttendance } from './components/RecentAttendance'
import { MonthDetailModal } from './components/MonthDetailModal'
import { AttendanceStatusModal } from './components/AttendanceStatusModal'
import { useMonthList } from './hooks/useMonthList'
import { useRecentAttendance } from './hooks/useRecentAttendance'
import { useMonthDetail } from './hooks/useMonthDetail'
import { useAttendanceEdit } from './hooks/useAttendanceEdit'
import { useAttendanceStatus } from './hooks/useAttendanceStatus'

export interface MyMonthlyAttendanceProps {
  teamId: string
}

export default function MyMonthlyAttendance({ teamId }: MyMonthlyAttendanceProps) {
  const { supabase } = useAuth()
  const attendanceAPI = useMemo(() => new AttendanceAPI(supabase), [supabase])
  const attendancesAPI = useMemo(() => new TeamAttendancesAPI(supabase), [supabase])

  const [selectedMonth, setSelectedMonth] = useState<{ year: number; month: number } | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false)
  const [selectedEventForAttendance, setSelectedEventForAttendance] = useState<TeamEvent | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const {
    monthList,
    loading: loadingMonthList,
    error: monthListError,
    loadMonthList,
    updateMonthStatus
  } = useMonthList(teamId, supabase, attendanceAPI)

  const {
    events: recentEvents,
    attendances: recentAttendances,
    editStates: recentEditStates,
    loading: loadingRecent,
    savingEventIds,
    error: recentError,
    loadRecentAttendances,
    handleStatusChange: handleRecentStatusChange,
    handleNoteChange: handleRecentNoteChange,
    saveEvent: handleSaveRecentEvent
  } = useRecentAttendance(teamId, supabase, attendanceAPI, updateMonthStatus)

  const {
    events: monthEvents,
    attendances: monthAttendances,
    loading: loadingMonth,
    error: monthError,
    loadAttendances: loadMonthAttendances
  } = useMonthDetail(teamId, supabase, attendanceAPI)

  const {
    editStates: monthEditStates,
    saving: savingMonth,
    error: editError,
    handleStatusChange: handleMonthStatusChange,
    handleNoteChange: handleMonthNoteChange,
    initializeEditStates,
    saveAll,
    setEditStates
  } = useAttendanceEdit(teamId, supabase, attendanceAPI)

  const {
    attendanceData,
    teamMembers,
    loading: loadingAttendance,
    loadAttendanceData
  } = useAttendanceStatus(teamId, supabase, attendancesAPI)

  useEffect(() => {
    loadMonthList()

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    loadRecentAttendances(abortController.signal)

    return () => {
      abortController.abort()
    }
  }, [loadMonthList, loadRecentAttendances])

  useEffect(() => {
    if (selectedMonth && isModalOpen) {
      const loadData = async () => {
        const result = await loadMonthAttendances(selectedMonth.year, selectedMonth.month)
        if (result) {
          initializeEditStates(result.events, result.attendances)
        }
      }
      loadData()
    }
  }, [selectedMonth, isModalOpen, loadMonthAttendances, initializeEditStates])

  const handleMonthClick = (year: number, month: number) => {
    setSelectedMonth({ year, month })
    setIsModalOpen(true)
  }

  const handleCloseModal = () => {
    setIsModalOpen(false)
    setSelectedMonth(null)
    setEditStates({})
  }

  const handleSaveAll = async () => {
    await saveAll(monthEvents, monthAttendances, async () => {
      if (selectedMonth) {
        await loadMonthAttendances(selectedMonth.year, selectedMonth.month)
      }
      await loadMonthList()
      handleCloseModal()
    })
  }

  const handleOpenAttendanceModal = async (event: TeamEvent) => {
    setSelectedEventForAttendance(event)
    setIsAttendanceModalOpen(true)
    await loadAttendanceData(event)
  }

  const handleCloseAttendanceModal = () => {
    setIsAttendanceModalOpen(false)
    setSelectedEventForAttendance(null)
  }

  const getMonthLabel = (year: number, month: number) => {
    return `${year}年${month}月`
  }

  const error = monthListError || recentError || monthError || editError

  if (loadingMonthList) {
    return (
      <div className="p-4">
        <div className="text-center py-6">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-gray-900"></div>
          <p className="mt-1.5 text-sm text-gray-500">読み込み中...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      <MonthList
        monthList={monthList}
        onMonthClick={handleMonthClick}
      />

      <RecentAttendance
        events={recentEvents}
        editStates={recentEditStates}
        savingEventIds={savingEventIds}
        loading={loadingRecent}
        onStatusChange={handleRecentStatusChange}
        onNoteChange={handleRecentNoteChange}
        onSave={handleSaveRecentEvent}
        attendances={recentAttendances}
      />

      <MonthDetailModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={selectedMonth ? getMonthLabel(selectedMonth.year, selectedMonth.month) : ''}
        events={monthEvents}
        editStates={monthEditStates}
        loading={loadingMonth}
        error={monthError}
        saving={savingMonth}
        onStatusChange={handleMonthStatusChange}
        onNoteChange={handleMonthNoteChange}
        onSaveAll={handleSaveAll}
        onEventClick={handleOpenAttendanceModal}
      />

      <AttendanceStatusModal
        isOpen={isAttendanceModalOpen}
        onClose={handleCloseAttendanceModal}
        event={selectedEventForAttendance}
        attendanceData={attendanceData}
        teamMembers={teamMembers}
        loading={loadingAttendance}
      />
    </div>
  )
}
