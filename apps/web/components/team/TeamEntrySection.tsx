'use client'

import { useEffect } from 'react'
import { useAuth } from '@/contexts/AuthProvider'
import { useTeamEntry } from '@/hooks/useTeamEntry'
import { CompetitionCard, EntryList, EntryForm } from './entry'
import type { TeamEntrySectionProps } from '@/types/team-entry'

export default function TeamEntrySection({
  teamId,
  isAdmin: _isAdmin
}: TeamEntrySectionProps) {
  const { supabase } = useAuth()
  const {
    loading,
    competitions,
    styles,
    expandedCompetitions,
    userEntries,
    submitting,
    errors,
    loadData,
    toggleCompetition,
    getFormData,
    updateFormData,
    handleSubmitEntry,
    handleEditEntry,
    handleCancelEdit,
    handleDeleteEntry
  } = useTeamEntry(supabase, teamId)

  useEffect(() => {
    loadData()
  }, [loadData])

  // ローディング表示
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    )
  }

  // エントリー受付中の大会がない場合は非表示
  if (competitions.length === 0) {
    return null
  }

  return (
    <div className="bg-orange-50 border border-orange-200 rounded-lg shadow-md p-6">
      <div className="flex items-center mb-4">
        <span className="text-2xl mr-2">📝</span>
        <h2 className="text-xl font-bold text-orange-900">
          エントリー受付中の大会
        </h2>
        <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-200 text-orange-800">
          {competitions.length}件
        </span>
      </div>

      <div className="space-y-4">
        {competitions.map((competition) => {
          const isExpanded = expandedCompetitions.has(competition.id)
          const entries = userEntries[competition.id] || []
          const formData = getFormData(competition.id)
          const formErrors = errors[competition.id] || {}

          return (
            <CompetitionCard
              key={competition.id}
              competition={competition}
              entries={entries}
              isExpanded={isExpanded}
              onToggle={() => toggleCompetition(competition.id)}
            >
              <EntryList
                entries={entries}
                onEdit={(entry) => handleEditEntry(competition.id, entry)}
                onDelete={(entryId) =>
                  handleDeleteEntry(competition.id, entryId)
                }
                submitting={submitting}
              />
              <EntryForm
                formData={formData}
                errors={formErrors}
                styles={styles}
                submitting={submitting}
                onUpdateForm={(updates) =>
                  updateFormData(competition.id, updates)
                }
                onSubmit={() => handleSubmitEntry(competition.id)}
                onCancelEdit={() => handleCancelEdit(competition.id)}
              />
            </CompetitionCard>
          )
        })}
      </div>
    </div>
  )
}
