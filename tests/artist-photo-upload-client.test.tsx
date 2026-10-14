// @vitest-environment jsdom
import { afterEach, expect, test, vi } from 'vitest'
import { prepareArtistPhoto, saveArtistPhotoFile } from '../src/artistPhotoUpload'
const mock = vi.hoisted(()=>({invoke:vi.fn()}))
vi.mock('../src/backend',()=>({backend:{functions:{invoke:mock.invoke}}}))
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals()})
function imageEnvironment(width=2000,height=1000,broken=false) {
  const draw=vi.fn(), encode=vi.fn((_cb:BlobCallback,_type:string)=>_cb(new Blob(['normalized png'],{type:'image/png'})))
  vi.stubGlobal('Image',class {naturalWidth=width;naturalHeight=height;src='';async decode(){if(broken)throw new Error('bad image')}})
  vi.stubGlobal('URL',class extends URL {static createObjectURL=vi.fn(()=>'blob:test');static revokeObjectURL=vi.fn()})
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({drawImage:draw} as unknown as CanvasRenderingContext2D)
  vi.spyOn(HTMLCanvasElement.prototype,'toBlob').mockImplementation(encode)
  return {draw,encode}
}
test('browser converts accepted source to bounded PNG and always revokes the temporary file URL', async()=>{
  const {draw,encode}=imageEnvironment()
  const blob=await prepareArtistPhoto(new File(['photo'],'artist.jpg',{type:'image/jpeg'}))
  expect(blob.type).toBe('image/png')
  expect(draw.mock.calls[0].slice(1)).toEqual([0,0,1024,512])
  expect(encode.mock.calls[0][1]).toBe('image/png')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
})
test('unsupported/empty files, broken decoding and excessive source pixels do not reach the API', async()=>{
  await expect(prepareArtistPhoto(new File(['svg'],'a.svg',{type:'image/svg+xml'}))).rejects.toThrow('PHOTO_FILE_TYPE')
  await expect(prepareArtistPhoto(new File([],'a.png',{type:'image/png'}))).rejects.toThrow('PHOTO_FILE_SIZE')
  imageEnvironment(100,100,true)
  await expect(prepareArtistPhoto(new File(['bad'],'a.png',{type:'image/png'}))).rejects.toThrow('PHOTO_FILE_INVALID')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test')
  imageEnvironment(6000,6000)
  await expect(prepareArtistPhoto(new File(['large'],'a.png',{type:'image/png'}))).rejects.toThrow('PHOTO_FILE_DIMENSIONS')
  expect(mock.invoke).not.toHaveBeenCalled()
})
test('upload forwards original microsecond version, rights and prepared PNG and surfaces API conflicts', async()=>{
  imageEnvironment()
  const band={id:'id',name:'Artist',country_code:'JP',aliases:[],updated_at:'2026-10-14T10:00:00.123456Z'}
  const photo={url:'',source:'https://official.example.com/photo',author:'Author',credit:'',license:'Permission',licenseUrl:'https://official.example.com/terms',usageBasis:'Display',identity:'id',retrievedAt:''}
  mock.invoke.mockResolvedValueOnce({data:{saved:true},error:null})
  await saveArtistPhotoFile(band,['별칭'],photo,new File(['photo'],'a.jpg',{type:'image/jpeg'}))
  const [name,{body}]=mock.invoke.mock.calls[0]
  expect(name).toBe('artist-photo-upload')
  expect(JSON.parse(body.get('metadata'))).toEqual({bandId:'id',version:band.updated_at,aliases:['별칭'],photo})
  expect(body.get('file').type).toBe('image/png')
  mock.invoke.mockResolvedValueOnce({error:{context:{json:async()=>({error:'EDIT_CONFLICT'})}}})
  await expect(saveArtistPhotoFile(band,[],photo,new File(['photo'],'a.png',{type:'image/png'}))).rejects.toThrow('EDIT_CONFLICT')
})
