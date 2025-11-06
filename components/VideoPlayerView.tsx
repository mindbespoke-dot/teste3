import React, { useState, useEffect } from 'react';
import axios from 'axios';
import type { Video } from '../types';
import { ArrowLeftIcon, CheckIcon } from './icons';

interface VideoPlayerViewProps {
  initialVideo: Video;
  playlist: Video[];
  onBack: () => void;
}

const VideoPlayerView: React.FC<VideoPlayerViewProps> = ({ initialVideo, playlist, onBack }) => {
  const [currentVideo, setCurrentVideo] = useState(initialVideo);
  const [completedVideos, setCompletedVideos] = useState<Set<number>>(new Set());

  useEffect(() => {
    setCurrentVideo(initialVideo);
  }, [initialVideo]);

  useEffect(() => {
    const completedIds = playlist
      .filter(video => (video as any).completed === 1)
      .map(video => video.id);
    setCompletedVideos(new Set(completedIds));
  }, [playlist]);

  const handleToggleComplete = async (videoId: number) => {
    const isCompleted = completedVideos.has(videoId);
    const newCompleted = new Set(completedVideos);
    
    if (isCompleted) {
      newCompleted.delete(videoId);
    } else {
      newCompleted.add(videoId);
    }
    
    setCompletedVideos(newCompleted);
    
    try {
      await axios.post(
        `/api/lessons/${videoId}/complete`, 
        { completed: !isCompleted },
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        }
      );
    } catch (error: any) {
      console.error('Failed to update lesson progress:', error);
      setCompletedVideos(new Set(completedVideos));
      
      if (error.response?.status === 400) {
        alert(error.response.data.error || 'Você precisa concluir as aulas anteriores primeiro');
      } else {
        alert('Erro ao atualizar progresso da aula');
      }
    }
  };
  
  const canMarkAsComplete = (videoId: number): boolean => {
    const videoIndex = playlist.findIndex(v => v.id === videoId);
    if (videoIndex === -1) return false;
    
    for (let i = 0; i < videoIndex; i++) {
      if (!completedVideos.has(playlist[i].id)) {
        return false;
      }
    }
    return true;
  };
  
  const isCurrentVideoCompleted = completedVideos.has(currentVideo.id);
  const canCompleteCurrentVideo = canMarkAsComplete(currentVideo.id);
  const progressPercentage = playlist.length > 0 ? (completedVideos.size / playlist.length) * 100 : 0;

  return (
    <div className="animate-fade-in max-w-7xl mx-auto">
      <div className="mb-4">
        <button 
          onClick={onBack} 
          className="flex items-center px-3 py-2 text-sm font-medium text-gray-300 bg-zinc-900 rounded-lg hover:bg-zinc-800 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-zinc-500"
        >
          <ArrowLeftIcon className="w-5 h-5 mr-2" />
          Voltar para o Conteúdo
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Player principal e controles */}
        <div className="flex-grow lg:w-2/3">
           <div className="aspect-video bg-black rounded-xl overflow-hidden shadow-2xl border border-zinc-800">
            <video 
              key={currentVideo.id}
              src={currentVideo.videoUrl} 
              poster={currentVideo.thumbnail} 
              controls 
              autoPlay 
              className="w-full h-full"
            >
              Seu navegador não suporta a tag de vídeo.
            </video>
          </div>
          
          {/* Detalhes da aula e botão */}
          <div className="mt-4 px-2 space-y-4">
            <div className="flex justify-between items-start sm:items-center flex-col sm:flex-row gap-4">
                <div>
                    <h2 className="text-3xl font-bold text-white">{currentVideo.title}</h2>
                    <p className="text-lg text-gray-400 mt-1">Duração: {currentVideo.duration}</p>
                </div>
                <button 
                    onClick={() => handleToggleComplete(currentVideo.id)}
                    disabled={!isCurrentVideoCompleted && !canCompleteCurrentVideo}
                    className={`flex items-center justify-center px-4 py-2 text-sm font-semibold rounded-lg shrink-0 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-green-500 ${
                        isCurrentVideoCompleted 
                        ? 'bg-green-800 text-white cursor-default' 
                        : canCompleteCurrentVideo
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-600 text-gray-300 cursor-not-allowed opacity-50'
                    }`}
                    title={!canCompleteCurrentVideo && !isCurrentVideoCompleted ? 'Conclua as aulas anteriores primeiro' : ''}
                >
                    {isCurrentVideoCompleted ? (
                        <>
                        <CheckIcon className="w-5 h-5 mr-2" />
                        Aula Concluída
                        </>
                    ) : (
                        'Marcar como Concluída'
                    )}
                </button>
            </div>
            <div className="pt-4 border-t border-zinc-800">
                <p className="text-gray-300 whitespace-pre-wrap">
                    {currentVideo.description || "Nenhuma descrição disponível para esta aula."}
                </p>
            </div>
          </div>
        </div>

        {/* Playlist */}
        <div className="lg:w-1/3 shrink-0">
          <div className="bg-black border border-zinc-800 rounded-xl p-4 h-full flex flex-col">
            <h3 className="text-xl font-bold mb-4 text-white shrink-0">Aulas neste módulo ({playlist.length})</h3>
            <div className="space-y-2 flex-grow overflow-y-auto pr-2">
              {playlist.map((video) => {
                const isCompleted = completedVideos.has(video.id);
                return (
                  <button
                    key={video.id}
                    onClick={() => setCurrentVideo(video)}
                    className={`w-full text-left p-2 rounded-lg flex items-center gap-4 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-zinc-500 ${
                      currentVideo.id === video.id ? 'bg-zinc-800' : 'hover:bg-zinc-900'
                    }`}
                  >
                    <img src={video.thumbnail} alt={video.title} className="w-24 aspect-video object-cover rounded-md shrink-0" />
                    <div className="overflow-hidden flex-grow flex items-center">
                      <div>
                        <p className={`font-semibold text-sm ${currentVideo.id === video.id ? 'text-white' : 'text-gray-200'}`}>{video.title}</p>
                        <p className="text-xs text-gray-400 mt-1">{video.duration}</p>
                      </div>
                      {isCompleted && <CheckIcon className="w-5 h-5 text-green-500 ml-auto shrink-0" />}
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="mt-4 pt-4 border-t border-zinc-800 shrink-0">
                <p className="text-sm font-medium text-gray-300 mb-2">Progresso: {Math.round(progressPercentage)}%</p>
                <div className="w-full bg-zinc-900 rounded-full h-2.5">
                    <div 
                        className="bg-green-600 h-2.5 rounded-full transition-all duration-500 shadow-lg shadow-green-600/20" 
                        style={{ width: `${progressPercentage}%` }}
                    ></div>
                </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoPlayerView;