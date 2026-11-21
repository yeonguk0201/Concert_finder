import { useEffect, useState } from 'react'
import { backend } from './backend'
import type { Band } from './data'
import { profileMatchesArtist } from './artistProfileContent'
import type { ArtistProfileContent } from './artistProfileContent'

// One optional detail RPC for the open artist, with stale responses fenced by identity.
export function useArtistProfile(band?: Band) {
  const [result,setResult]=useState<{ band?: Band; profile?: ArtistProfileContent; available: boolean }>({available:false})
  useEffect(()=>{
    if(!band?.musicbrainzId || typeof backend?.rpc!=='function') return
    let active=true
    void backend.rpc('artist_profile_content',{target_band_id:band.id}).then(({data,error})=>{
      if(active) setResult({band,available:!error,profile:!error && profileMatchesArtist(data,band)?data:undefined})
    },()=>{if(active) setResult({band,available:false})})
    return ()=>{active=false}
  },[band])
  return result.band===band ? result : {available:false,profile:undefined}
}
