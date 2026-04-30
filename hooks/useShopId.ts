'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useShopId() {
  const [shopId, setShopId] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user?.id) {
        setShopId(session.user.id)
      }
      setLoading(false)
    })
  }, [])

  return { shopId, loading }
}
