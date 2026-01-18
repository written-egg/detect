import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import styled, { keyframes, createGlobalStyle } from 'styled-components';
import { GoogleGenAI } from "@google/genai";

// --- Game Data & Types ---

type FileType = 'text' | 'dir' | 'encrypted';

interface FileNode {
  name: string;
  type: FileType;
  content?: string; // For text files
  children?: Record<string, FileNode>; // For directories
  password?: string; // For encrypted files
  lockedContent?: string; // The content revealed after decryption
  isLocked?: boolean; // State of encryption
  date?: string; // File date for immersion
}

interface LogEntry {
  type: 'info' | 'error' | 'success' | 'command' | 'system' | 'ai';
  content: React.ReactNode;
}

interface GameState {
  path: string[];
  history: LogEntry[];
  fileSystem: Record<string, FileNode>; // Root is a directory's children
  isSolved: boolean;
  isThinking: boolean;
}

// --- The Case Content (The Mystery) ---

const INITIAL_FS: Record<string, FileNode> = {
  'README.txt': {
    name: 'README.txt',
    type: 'text',
    date: '1999-01-01',
    content: `
仅限授权人员访问
=========================
案件编号: #99-042 "雨夜屠夫案"
状态: 悬案 / 未结
首席侦探: J. Miller (已故)

操作指南:
- 输入 'ls' 列出当前文件。
- 输入 'cd [文件夹名]' 进入目录。
- 输入 'open [文件名]' 阅读证据 (无需输入后缀)。
- 输入 'decrypt [文件名] [密码]' 解锁加密文件。
- 输入 'search [关键词]' 在整个数据库中搜索线索。
- 输入 'ask [问题]' 让 AI 助手分析已发现的线索。
    `
  },
  'evidence': {
    name: 'evidence',
    type: 'dir',
    children: {
      'police_report.txt': {
        name: 'police_report.txt',
        type: 'text',
        date: '1999-11-04',
        content: `
案件报告 #8921
日期: 1999年11月4日
嫌疑人: Arthur Vance (男, 45岁)
地址: 橡树街 4200号

嫌疑人因涉嫌 Sarah O'Neil 失踪案被拘留问话。
嫌疑人拒绝在律师不在场的情况下发言，但一直喃喃自语提到“那个安全的地方”，
并声称没人能找到那里。

随身物品: 一张洋娃娃的购买收据，日期是 7月14日。
        `
      },
      'witness_stmt.txt': {
        name: 'witness_stmt.txt',
        type: 'text',
        date: '1999-11-05',
        content: `
证人陈述: Maria Gonzalez (邻居)

"Arthur 是个很安静的人，非常注重隐私。去年他换了三次地下室的门锁。
他总是说他在给他的女儿 Maya 建一个游戏室。
可怜的孩子，她几年前就去世了，但他说话的语气就像她还活着一样。"
        `
      },
      'photo_log.txt': {
        name: 'photo_log.txt',
        type: 'text',
        date: '1999-11-06',
        content: `
[图片已损坏 - 仅显示文字描述]

照片 #1: 客厅。整洁。
照片 #2: 厨房。墙上挂着日历。翻开的月份是 1995年7月。
         14号被红笔圈了起来，旁边写着“Maya 的日子”。
照片 #3: 地下室门。挂着沉重的挂锁。
        `
      }
    }
  },
  'interviews': {
    name: 'interviews',
    type: 'dir',
    children: {
      'transcript_01.txt': {
        name: 'transcript_01.txt',
        type: 'text',
        date: '1999-11-04',
        content: `
Miller 警探: 她在哪，Arthur？
Vance: 她很安全。比这里安全。
Miller 警探: 我们搜查了房子。是空的。
Vance: 你们不知道密码。你们不了解我。
Miller 警探: 把地下室挂锁的密码告诉我们。
Vance: 那只是个日期。我这辈子最快乐的一天。我的小天使降生的那天。
       但你们永远猜不到年份。那是史上最热的一个夏天... '95年。
       
(录音结束)
        `
      }
    }
  },
  'encrypted': {
    name: 'encrypted',
    type: 'dir',
    children: {
      'coordinates.enc': {
        name: 'coordinates.enc',
        type: 'encrypted',
        isLocked: true,
        password: '071495', // July 14, 95
        date: '1999-11-07',
        lockedContent: `
--- 解密成功 ---

文件: coordinates.txt
内容:

"他们以为我疯了。但我建造了那个避难所。
位置: 
旧污水处理厂
7G区, 4号隧道。
门禁密码: 8821

她在那里等着。她在沉睡。"

(案件已破。你找到了受害者的位置。)
        `,
        content: `
[加密文件]
[算法: AES-128]
[状态: 已锁定]

输入密码查看内容。
提示: 密码格式为 MMDDYY (月月日日年年)。
        `
      }
    }
  },
  'notes': {
    name: 'notes',
    type: 'dir',
    children: {
      'miller_diary.txt': {
        name: 'miller_diary.txt',
        type: 'text',
        date: '2000-02-01',
        content: `
我们要放他走了。证据不足。
我知道是他做的。我知道他把她藏在某处。
如果我能破解他在服务器上留下的那个文件就好了。
他一直提到他女儿的生日。
我查了记录，Maya 出生在七月。七月中旬。
但我记不清确切的日期了... 也许照片里有线索？
        `
      }
    }
  }
};

// --- Styles ---

const amberGlow = keyframes`
  0% { text-shadow: 0 0 2px #ffb000; }
  50% { text-shadow: 0 0 8px #ffb000, 0 0 12px #ff8800; }
  100% { text-shadow: 0 0 2px #ffb000; }
`;

const scanline = keyframes`
  0% { background-position: 0% 0%; }
  100% { background-position: 0% 100%; }
`;

const blink = keyframes`
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
`;

const GlobalStyle = createGlobalStyle`
  body {
    background: #110d0a;
    color: #ffb000;
  }
  ::selection {
    background: #ffb000;
    color: #000;
  }
`;

const TerminalContainer = styled.div`
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 2rem;
  box-sizing: border-box;
  font-size: 1.1rem;
  position: relative;
  
  &::before {
    content: " ";
    position: absolute;
    top: 0; left: 0; width: 100%; height: 100%;
    background: linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.25) 50%), linear-gradient(90deg, rgba(255, 0, 0, 0.06), rgba(0, 255, 0, 0.02), rgba(0, 0, 255, 0.06));
    background-size: 100% 2px, 3px 100%;
    pointer-events: none;
    z-index: 10;
  }
`;

const Header = styled.div`
  border-bottom: 2px solid #ffb000;
  padding-bottom: 10px;
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  text-transform: uppercase;
  letter-spacing: 2px;
  animation: ${amberGlow} 4s infinite;
`;

const OutputArea = styled.div`
  flex: 1;
  overflow-y: auto;
  margin-bottom: 20px;
  white-space: pre-wrap;
  font-family: 'VT323', monospace;
`;

const InputForm = styled.form`
  display: flex;
  align-items: center;
  background: rgba(255, 176, 0, 0.05);
  padding: 10px;
`;

const Prompt = styled.span`
  margin-right: 10px;
  color: #ffb000;
  font-weight: bold;
`;

const Input = styled.input`
  flex: 1;
  background: transparent;
  border: none;
  color: #ffb000;
  font-family: 'VT323', monospace;
  font-size: 1.2rem;
  outline: none;
  caret-color: #ffb000;
  
  &:disabled {
    opacity: 0.5;
    cursor: wait;
  }
`;

const LogLine = styled.div<{ type: LogEntry['type'] }>`
  margin-bottom: 6px;
  line-height: 1.4;
  color: ${props => 
    props.type === 'error' ? '#ff4444' : 
    props.type === 'success' ? '#ffffaa' : 
    props.type === 'system' ? '#885500' : 
    props.type === 'ai' ? '#00e5ff' :
    '#ffb000'};
  
  ${props => props.type === 'command' && `
    margin-top: 12px;
    font-weight: bold;
    opacity: 0.8;
  `}
  
  ${props => props.type === 'info' && `
    margin-left: 0px;
  `}
`;

const FileGrid = styled.div`
  display: grid;
  grid-template-columns: 120px 80px 1fr;
  gap: 16px;
  align-items: center;
`;

const FileLink = styled.span`
  cursor: pointer;
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 4px;
  &:hover {
    background: #ffb000;
    color: #110d0a;
  }
  &:active {
    opacity: 0.7;
  }
`;

const LoadingCursor = styled.span`
  display: inline-block;
  width: 10px;
  height: 1.2em;
  background: #ffb000;
  animation: ${blink} 1s step-end infinite;
  vertical-align: middle;
  margin-left: 5px;
`;

// --- Logic Helpers ---

// Helper to get node at current path
const getNode = (fs: Record<string, FileNode>, path: string[]): FileNode | undefined => {
  if (path.length === 0) return { name: 'root', type: 'dir', children: fs };
  
  let current: FileNode | undefined = { name: 'root', type: 'dir', children: fs };
  
  for (const p of path) {
    if (current && current.type === 'dir' && current.children) {
      current = current.children[p];
    } else {
      return undefined;
    }
  }
  return current;
};

// Find a file node path recursively (for hints)
const findFilePath = (fs: Record<string, FileNode>, targetName: string, currentPath: string = ''): string | null => {
  for (const [key, node] of Object.entries(fs)) {
    // Check against filename or filename without extension
    const nameWithoutExt = key.includes('.') ? key.split('.')[0] : key;
    if (key.toLowerCase() === targetName.toLowerCase() || nameWithoutExt.toLowerCase() === targetName.toLowerCase()) {
      return currentPath ? `${currentPath}/${key}` : key;
    }
    if (node.type === 'dir' && node.children) {
      const found = findFilePath(node.children, targetName, currentPath ? `${currentPath}/${key}` : key);
      if (found) return found;
    }
  }
  return null;
};

// Helper to resolve fuzzy filename (e.g., "readme" -> "README.txt")
const resolveFileName = (dir: Record<string, FileNode>, inputName: string): string | null => {
  const normalizedInput = inputName.toLowerCase();
  
  // 1. Exact match
  const exactMatch = Object.keys(dir).find(k => k.toLowerCase() === normalizedInput);
  if (exactMatch) return exactMatch;

  // 2. Extensionless match (input "file" matches "file.txt")
  const fuzzyMatch = Object.keys(dir).find(k => {
    const nameWithoutExt = k.includes('.') ? k.substring(0, k.lastIndexOf('.')) : k;
    return nameWithoutExt.toLowerCase() === normalizedInput;
  });
  
  return fuzzyMatch || null;
}

// Recursive search
const searchFS = (fs: Record<string, FileNode>, query: string, pathPrefix: string = ''): string[] => {
  let results: string[] = [];
  const q = query.toLowerCase();

  for (const [key, node] of Object.entries(fs)) {
    const currentPath = pathPrefix ? `${pathPrefix}/${key}` : key;
    
    // Check filename
    if (key.toLowerCase().includes(q)) {
      results.push(`[文件匹配] ${currentPath}`);
    }

    // Check content (if text and not encrypted/locked)
    if (node.type === 'text' && node.content && node.content.toLowerCase().includes(q)) {
      results.push(`[内容匹配] ${currentPath}`);
    }
    
    // Check decrypted content if unlocked
    if (node.type === 'encrypted' && !node.isLocked && node.lockedContent && node.lockedContent.toLowerCase().includes(q)) {
       results.push(`[内容匹配] ${currentPath}`);
    }

    // Recurse
    if (node.type === 'dir' && node.children) {
      results = [...results, ...searchFS(node.children, q, currentPath)];
    }
  }
  return results;
};

// --- AI Context Builder ---
const buildDatabaseContext = (fs: Record<string, FileNode>, pathPrefix: string = ''): string => {
  let context = "";
  
  for (const [key, node] of Object.entries(fs)) {
    const fullPath = pathPrefix ? `${pathPrefix}/${key}` : key;
    
    if (node.type === 'dir' && node.children) {
      context += buildDatabaseContext(node.children, fullPath);
    } else if (node.type === 'text') {
      context += `\n=== 文件: ${fullPath} ===\n${node.content}\n`;
    } else if (node.type === 'encrypted') {
      if (node.isLocked) {
        // AI knows the file exists but not the content
        context += `\n=== 文件: ${fullPath} ===\n[状态: 加密/锁定]\n(注意: 你无法读取此文件内容，直到用户解密它。)\n`;
      } else {
        // AI can now read the unlocked content
        context += `\n=== 文件: ${fullPath} ===\n[状态: 已解密]\n${node.lockedContent}\n`;
      }
    }
  }
  return context;
};

// --- Main App ---

const App = () => {
  const [fileSystem, setFileSystem] = useState(INITIAL_FS);
  const [gameState, setGameState] = useState<GameState>({
    path: [],
    history: [
      { type: 'system', content: '正在连接洛杉矶警局档案服务器...' },
      { type: 'system', content: '连接已建立。' },
      { type: 'system', content: '用户: 访客侦探 (只读权限)' },
      { type: 'info', content: '欢迎访问冷案数据库。' },
      { type: 'info', content: '输入 "help" 查看可用指令。' },
      { type: 'info', content: ' ' },
    ],
    isSolved: false,
    isThinking: false,
  });

  const [input, setInput] = useState('');
  const outputRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [gameState.history, gameState.isThinking]);

  const addLog = (content: React.ReactNode, type: LogEntry['type'] = 'info') => {
    setGameState(prev => ({
      ...prev,
      history: [...prev.history, { type, content }]
    }));
  };

  const handleCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = input.trim();
    if (!cmd) return;

    // Log the command immediately
    setGameState(prev => ({
      ...prev,
      history: [...prev.history, { type: 'command', content: `> ${cmd}` }]
    }));
    
    setInput('');
    
    // Process command
    await processCommand(cmd);
  };

  const processCommand = async (rawCmd: string) => {
    const parts = rawCmd.split(' ');
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1);

    // Get current directory
    const currentDirNode = getNode(fileSystem, gameState.path);
    if (!currentDirNode || currentDirNode.type !== 'dir' || !currentDirNode.children) {
      addLog('系统错误: 路径丢失。', 'error');
      return;
    }
    const currentDir = currentDirNode.children;

    switch (cmd) {
      case 'help':
        const helpTopic = args[0] ? args[0].toLowerCase() : null;
        if (helpTopic) {
          switch (helpTopic) {
            case 'ls':
            case 'dir':
            case 'll':
              addLog('指令: ls', 'system');
              addLog('描述: 列出当前目录下的所有文件。点击文件名可复制。', 'info');
              break;
            case 'cd':
              addLog('指令: cd [目录名]', 'system');
              addLog('描述: 进入指定的文件夹。', 'info');
              addLog('      使用 ".." 返回上一级。', 'info');
              addLog('      使用 "/" 返回根目录。', 'info');
              break;
            case 'open':
            case 'cat':
            case 'read':
            case 'view':
              addLog('指令: open [文件名]', 'system');
              addLog('描述: 阅读文本文件内容。无需输入后缀名。', 'info');
              break;
            case 'decrypt':
            case 'unlock':
              addLog('指令: decrypt [文件名] [密码]', 'system');
              addLog('描述: 使用密码解锁加密文件。', 'info');
              break;
            case 'search':
            case 'find':
            case 'grep':
              addLog('指令: search [关键词]', 'system');
              addLog('描述: 在整个数据库中搜索包含该关键词的文件。', 'info');
              break;
            case 'ask':
            case 'ai':
              addLog('指令: ask [问题]', 'system');
              addLog('描述: 让人工智能助手分析当前所有已知的线索并回答问题。', 'info');
              break;
            case 'clear':
              addLog('指令: clear', 'system');
              addLog('描述: 清空屏幕。', 'info');
              break;
            default:
              addLog(`未找到关于 "${helpTopic}" 的说明。`, 'error');
          }
        } else {
          addLog('可用指令列表:', 'system');
          addLog('  ls / dir               : 列出当前文件', 'info');
          addLog('  cd [目录]              : 切换目录 (输入 cd .. 返回上一级)', 'info');
          addLog('  open [文件]            : 打开文件 (无需后缀)', 'info');
          addLog('  search [关键词]        : 全局搜索', 'info');
          addLog('  decrypt [文件] [密码]  : 解密文件', 'info');
          addLog('  ask [问题]             : AI 助手分析 (新功能)', 'info');
          addLog('  clear                  : 清屏', 'info');
          addLog('  help [指令]            : 查看具体指令帮助', 'info');
        }
        break;

      case 'ls':
      case 'dir':
      case 'll':
        const files = Object.values(currentDir);
        if (files.length === 0) {
          addLog('(目录为空)', 'info');
        } else {
          addLog(
            <FileGrid style={{ borderBottom: '1px dashed #ffb000', paddingBottom: '4px', marginBottom: '8px', fontWeight: 'bold' }}>
              <span>日期</span>
              <span>类型</span>
              <span>文件名 (点击复制)</span>
            </FileGrid>,
            'system'
          );

          files.forEach(f => {
             const typeStr = f.type === 'dir' ? '<目录>' : f.type === 'encrypted' ? '<加密>' : '<文本>';
             const dateStr = f.date || '---- -- --';
             
             addLog(
               <FileGrid>
                 <span>{dateStr}</span>
                 <span>{typeStr}</span>
                 <FileLink onClick={() => {
                   navigator.clipboard.writeText(f.name);
                   addLog(`系统: 已将 "${f.name}" 复制到剪贴板。`, 'success');
                 }}>
                   {f.name}
                 </FileLink>
               </FileGrid>,
               f.type === 'dir' ? 'success' : 'info'
             );
          });
        }
        break;

      case 'cd':
        if (!args[0]) {
           addLog('用法: cd [目录名]', 'error');
           return;
        }
        const targetRaw = args[0];
        if (targetRaw === '..') {
           if (gameState.path.length === 0) {
             addLog('访问拒绝: 已在根目录。', 'error');
           } else {
             setGameState(prev => ({
               ...prev,
               path: prev.path.slice(0, -1)
             }));
           }
        } else if (targetRaw === '/') {
             setGameState(prev => ({
               ...prev,
               path: []
             }));
        } else {
           // Resolve directory name (fuzzy match allowed for folders too?)
           const realDirName = Object.keys(currentDir).find(k => k.toLowerCase() === targetRaw.toLowerCase());
           
           if (realDirName && currentDir[realDirName].type === 'dir') {
             setGameState(prev => ({
               ...prev,
               path: [...prev.path, realDirName]
             }));
           } else {
             addLog(`未找到目录: ${targetRaw}`, 'error');
             const hintPath = findFilePath(fileSystem, targetRaw);
             if (hintPath) {
               addLog(`提示: 在 '${hintPath}' 找到了类似名称。它是文件吗？`, 'system');
             }
           }
        }
        break;

      case 'cat':
      case 'open':
      case 'read':
      case 'view':
        if (!args[0]) {
          addLog('用法: open [文件名]', 'error');
          return;
        }
        const userInputName = args[0];
        
        // Use smart resolution
        const realFileName = resolveFileName(currentDir, userInputName);
        const file = realFileName ? currentDir[realFileName] : undefined;

        if (!file) {
          addLog(`未找到文件: ${userInputName}`, 'error');
          // Helper: Smart hint
          const possiblePath = findFilePath(fileSystem, userInputName);
          if (possiblePath) {
             addLog(`提示: 在 '/${possiblePath}' 找到了该文件。请先进入该目录。`, 'system');
          }
        } else if (file.type === 'dir') {
          addLog(`${realFileName} 是一个目录。请使用 'cd' 进入。`, 'error');
        } else if (file.type === 'encrypted' && file.isLocked) {
          addLog(`访问拒绝: 文件已加密。`, 'error');
          addLog(file.content || '', 'info');
          addLog(`使用 'decrypt ${realFileName} [密码]' 进行解锁。`, 'system');
        } else if (file.type === 'encrypted' && !file.isLocked) {
           addLog(`正在打开加密文件: ${realFileName}...`, 'success');
           addLog(file.lockedContent || '', 'info');
           // Trigger win state if it's the coordinates file
           if (realFileName === 'coordinates.enc') {
              setGameState(prev => ({ ...prev, isSolved: true }));
           }
        } else {
          addLog(`正在打开文件: ${realFileName}...`, 'success');
          addLog(file.content || '', 'info');
        }
        break;

      case 'decrypt':
      case 'unlock':
        if (args.length < 2) {
          addLog('用法: decrypt [文件名] [密码]', 'error');
          return;
        }
        const encInputName = args[0];
        const attemptPass = args[1];
        
        const realEncName = resolveFileName(currentDir, encInputName);
        const encFile = realEncName ? currentDir[realEncName] : undefined;

        if (!encFile) {
           addLog(`未找到文件: ${encInputName}`, 'error');
        } else if (encFile.type !== 'encrypted') {
           addLog(`${realEncName} 不是加密文件。`, 'error');
        } else if (!encFile.isLocked) {
           addLog(`${realEncName} 已经解锁了。`, 'info');
        } else {
           if (encFile.password === attemptPass) {
             addLog('正在解密...', 'system');
             // Simulate delay
             await new Promise(r => setTimeout(r, 800));
             
             addLog('访问批准。', 'success');
             
             // Mutate FS
             const newFS = { ...fileSystem };
             let ptr = newFS;
             for(const p of gameState.path) {
               // @ts-ignore
               ptr = ptr[p].children; 
             }
             // @ts-ignore
             ptr[realEncName].isLocked = false;

             setFileSystem(newFS);
             addLog(`文件 ${realEncName} 已解锁。使用 'open' 查看内容。`, 'success');
           } else {
             addLog('访问拒绝: 密码错误。', 'error');
           }
        }
        break;
      
      case 'search':
      case 'find':
      case 'grep':
        if (!args[0]) {
           addLog('用法: search [关键词]', 'error');
           return;
        }
        const query = args.join(' ');
        addLog(`正在搜索数据库: "${query}"...`, 'system');
        const results = searchFS(fileSystem, query);
        if (results.length > 0) {
          results.forEach(res => addLog(res, 'success'));
        } else {
          addLog('未找到匹配项。', 'info');
        }
        break;
      
      case 'ask':
      case 'ai':
        if (!args[0]) {
          addLog('用法: ask [你的问题]', 'error');
          return;
        }
        const userQuestion = args.join(' ');
        
        // Build context from *current* filesystem state
        const dbContext = buildDatabaseContext(fileSystem);
        
        setGameState(prev => ({ ...prev, isThinking: true }));
        
        try {
          const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
          const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: [
              { role: 'user', parts: [{ text: userQuestion }] }
            ],
            config: {
              systemInstruction: `
你是一个运行在1999年洛杉矶警局(L.A.P.D.)旧服务器上的档案分析AI助手。
你的任务是帮助名为 "Guest" 的侦探分析案件 #99-042 "雨夜屠夫案"。

以下是数据库中目前所有可访问的文件内容：
--- 数据库开始 ---
${dbContext}
--- 数据库结束 ---

规则：
1. **仅依据上述提供的数据库内容**回答用户的问题。不要编造数据库中不存在的事实。
2. 如果用户询问的内容在一个标有 [状态: 加密/锁定] 的文件中，你必须明确告知用户该文件已被加密，你无法读取其内容，需要用户先找到密码并使用 decrypt 指令解锁。
3. 你的回答风格应该像一个老式的、略带机械感的计算机终端界面，使用中文回答。
4. 保持回答简洁明了，适合在命令行终端阅读。
5. 如果用户问到关键线索（如密码），如果文件中明确写着，你可以指出文件来源；如果文件中只是暗示（如“密码是女儿生日”），你应该引导用户去思考，而不是直接给出答案，除非用户明确要求推理。
              `
            }
          });
          
          setGameState(prev => ({ ...prev, isThinking: false }));
          addLog(`[AI 分析结果]:\n${response.text.trim()}`, 'ai');
          
        } catch (err) {
          setGameState(prev => ({ ...prev, isThinking: false }));
          addLog('连接 AI 服务器失败。请稍后再试。', 'error');
          console.error(err);
        }
        break;

      case 'clear':
        setGameState(prev => ({...prev, history: []}));
        break;

      default:
        addLog(`无效指令: ${cmd}`, 'error');
    }
  };

  return (
    <>
      <GlobalStyle />
      <TerminalContainer onClick={() => inputRef.current?.focus()}>
        <Header>
          <span>L.A.P.D. 档案数据库</span>
          <span>{new Date().toLocaleDateString()}</span>
          <span>案件 #99-042</span>
        </Header>
        
        <OutputArea ref={outputRef}>
          {gameState.history.map((entry, idx) => (
            <LogLine key={idx} type={entry.type}>{entry.content}</LogLine>
          ))}
          {gameState.isThinking && (
            <LogLine type="system">
              正在分析数据库 <LoadingCursor />
            </LogLine>
          )}
          {gameState.isSolved && (
             <LogLine type="success">
               <br/>
               ***********************************************<br/>
               * 恭喜你，警探。案件已破。                    *<br/>
               * 报告已归档: 嫌疑人藏身处已确认。            *<br/>
               ***********************************************<br/>
             </LogLine>
          )}
        </OutputArea>
        
        <InputForm onSubmit={handleCommand}>
          <Prompt>{`GUEST@LAPD: ~${gameState.path.length ? '/' + gameState.path.join('/') : ''}$`}</Prompt>
          <Input 
            ref={inputRef}
            type="text" 
            value={input} 
            onChange={(e) => setInput(e.target.value)} 
            autoFocus 
            spellCheck={false}
            disabled={gameState.isThinking}
          />
        </InputForm>
      </TerminalContainer>
    </>
  );
};

const root = createRoot(document.getElementById('root')!);
root.render(<App />);