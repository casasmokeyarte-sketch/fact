import React, { useEffect, useState, useRef } from 'react';
import { supabase } from '../lib/supabaseClient';

export function FlashReminderPopup({ currentUser, shift }) {
  const [pendingReminders, setPendingReminders] = useState([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewsMap, setViewsMap] = useState({});
  const [hasChecked, setHasChecked] = useState(false);
  const isFetchingRef = useRef(false);

  // We check only when currentUser and shift are active (shift !== null)
  useEffect(() => {
    if (!currentUser?.id || !shift?.id) {
      setPendingReminders([]);
      setCurrentIndex(0);
      setHasChecked(false);
      return;
    }

    if (hasChecked || isFetchingRef.current) return;

    async function checkReminders() {
      isFetchingRef.current = true;
      try {
        // 1. Fetch active reminders for the company
        const { data: reminders, error: remindersError } = await supabase
          .from('flash_reminders')
          .select('*')
          .eq('active', true);

        if (remindersError) throw remindersError;
        if (!reminders || reminders.length === 0) {
          setHasChecked(true);
          return;
        }

        // 2. Filter by user's role (if target_roles is specified)
        const userRole = String(currentUser.role || '').trim();
        const roleFiltered = reminders.filter(r => {
          if (!r.target_roles || r.target_roles.length === 0) return true;
          // Case-insensitive check
          return r.target_roles.some(role => role.toLowerCase() === userRole.toLowerCase());
        });

        if (roleFiltered.length === 0) {
          setHasChecked(true);
          return;
        }

        // 3. Fetch user's views history
        const { data: views, error: viewsError } = await supabase
          .from('flash_reminder_views')
          .select('reminder_id, views_count')
          .eq('user_id', currentUser.id);

        if (viewsError) throw viewsError;

        const viewsObj = {};
        if (views) {
          views.forEach(v => {
            viewsObj[v.reminder_id] = Number(v.views_count || 0);
          });
        }
        setViewsMap(viewsObj);

        // 4. Find which ones are pending (views < max_views, where max_views = 0 means unlimited)
        const pending = roleFiltered.filter(r => {
          const viewedCount = viewsObj[r.id] || 0;
          const maxViews = Number(r.max_views ?? 1);
          return maxViews === 0 || viewedCount < maxViews;
        });

        // Sort by created_at (oldest first or newest first)
        pending.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

        setPendingReminders(pending);
        setCurrentIndex(0);
      } catch (err) {
        console.error('Error loading flash reminders:', err);
      } finally {
        setHasChecked(true);
        isFetchingRef.current = false;
      }
    }

    checkReminders();
  }, [currentUser?.id, shift?.id, hasChecked]);

  const handleDismiss = async () => {
    if (pendingReminders.length === 0) return;
    const currentReminder = pendingReminders[currentIndex];
    
    // Optimistic UI updates
    const updatedViewsMap = { ...viewsMap };
    const currentCount = updatedViewsMap[currentReminder.id] || 0;
    updatedViewsMap[currentReminder.id] = currentCount + 1;
    setViewsMap(updatedViewsMap);

    try {
      // Record view in database
      if (currentCount === 0) {
        // First view, insert record
        await supabase.from('flash_reminder_views').insert({
          reminder_id: currentReminder.id,
          user_id: currentUser.id,
          views_count: 1,
          last_viewed_at: new Date().toISOString()
        });
      } else {
        // Update existing record
        await supabase
          .from('flash_reminder_views')
          .update({
            views_count: currentCount + 1,
            last_viewed_at: new Date().toISOString()
          })
          .eq('reminder_id', currentReminder.id)
          .eq('user_id', currentUser.id);
      }
    } catch (err) {
      console.error('Error updating reminder view count:', err);
    }

    // Go to next reminder in queue, or close
    if (currentIndex + 1 < pendingReminders.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setPendingReminders([]);
      setCurrentIndex(0);
    }
  };

  if (pendingReminders.length === 0 || currentIndex >= pendingReminders.length) {
    return null;
  }

  const reminder = pendingReminders[currentIndex];

  return (
    <div className="modal-overlay" style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.75)',
      backdropFilter: 'blur(4px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 2000,
      animation: 'fadeIn 0.25s ease-out'
    }}>
      <div className="card" style={{
        width: '580px',
        maxWidth: '92vw',
        maxHeight: '90vh',
        overflowY: 'auto',
        border: '2px solid #ffb400', // Amber/orange alert border
        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5), 0 0 15px rgba(255, 180, 0, 0.2)',
        borderRadius: '1rem',
        backgroundColor: 'var(--surface-card, #1e293b)',
        color: 'var(--text-primary, #f8fafc)',
        display: 'flex',
        flexDirection: 'column',
        gap: '1.25rem',
        padding: '1.75rem',
        animation: 'slideUp 0.3s ease-out'
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', borderBottom: '1px solid var(--border-soft, #334155)', paddingBottom: '0.75rem' }}>
          <span style={{ fontSize: '1.75rem' }}>📢</span>
          <div style={{ flex: 1 }}>
            <h3 style={{ margin: 0, color: '#ffb400', fontSize: '1.35rem', fontWeight: 'bold' }}>
              {reminder.title || 'Recordatorio Importante'}
            </h3>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #94a3b8)' }}>
              Anuncio del momento ({currentIndex + 1} de {pendingReminders.length})
            </span>
          </div>
        </div>

        {/* Media (Image or Video) */}
        {reminder.media_url && (
          <div style={{
            display: 'flex',
            justifyContent: 'center',
            backgroundColor: '#0f172a',
            borderRadius: '0.75rem',
            overflow: 'hidden',
            maxHeight: '340px',
            border: '1px solid var(--border-soft, #334155)'
          }}>
            {reminder.media_type === 'video' ? (
              <video
                src={reminder.media_url}
                controls
                autoPlay
                playsInline
                style={{ width: '100%', maxHeight: '340px', objectFit: 'contain' }}
              />
            ) : (
              <img
                src={reminder.media_url}
                alt={reminder.title}
                style={{ width: '100%', maxHeight: '340px', objectFit: 'contain' }}
              />
            )}
          </div>
        )}

        {/* Message description */}
        {reminder.description && (
          <div style={{
            fontSize: '1.05rem',
            lineHeight: '1.6',
            color: 'var(--text-primary, #e2e8f0)',
            whiteSpace: 'pre-wrap',
            padding: '0.25rem'
          }}>
            {reminder.description}
          </div>
        )}

        {/* Action Button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '1px solid var(--border-soft, #334155)', paddingTop: '1rem', marginTop: '0.5rem' }}>
          <button
            className="btn btn-primary"
            onClick={handleDismiss}
            style={{
              padding: '0.6rem 2rem',
              fontSize: '1.05rem',
              fontWeight: 'bold',
              backgroundColor: '#ffb400',
              borderColor: '#ffb400',
              color: '#1e293b',
              cursor: 'pointer',
              borderRadius: '0.5rem',
              transition: 'transform 0.15s ease, opacity 0.15s ease'
            }}
            onMouseOver={(e) => e.target.style.opacity = '0.9'}
            onMouseOut={(e) => e.target.style.opacity = '1'}
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  );
}
