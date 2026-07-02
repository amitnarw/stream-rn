import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../theme';

interface CustomModalProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmText?: string;
  onConfirm?: () => void;
  glowColors: string[];
  iconName: any;
  iconColor: string;
  iconBgColor: string;
  confirmDestructive?: boolean;
}

export function CustomModal({
  visible,
  onClose,
  title,
  message,
  confirmText,
  onConfirm,
  glowColors,
  iconName,
  iconColor,
  iconBgColor,
  confirmDestructive = false,
}: CustomModalProps) {
  const isConfirmMode = !!confirmText && !!onConfirm;

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFillObject} onPress={onClose} />
        <View style={styles.modalContent}>
          {/* Ambient top glow */}
          <LinearGradient
            colors={glowColors}
            style={styles.modalGlow}
            pointerEvents="none"
          />
          
          <View style={styles.modalHeader}>
            <View style={[styles.iconContainer, { backgroundColor: iconBgColor }]}>
              <Ionicons name={iconName} size={22} color={iconColor} />
            </View>
            <Text style={styles.modalTitle}>{title}</Text>
          </View>

          <Text style={styles.modalMessage}>{message}</Text>

          {isConfirmMode ? (
            <View style={styles.modalButtonRow}>
              <TouchableOpacity 
                style={styles.modalCancelBtn} 
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.modalCancelBtnText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[
                  styles.modalConfirmBtn, 
                  confirmDestructive ? styles.modalConfirmBtnDestructive : styles.modalConfirmBtnPrimary
                ]} 
                onPress={() => {
                  onClose();
                  if (onConfirm) onConfirm();
                }}
                activeOpacity={0.8}
              >
                <Text style={styles.modalConfirmBtnText}>{confirmText}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={styles.modalOkBtn} 
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.modalOkBtnText}>OK</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    width: '85%',
    backgroundColor: '#121214',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 24,
    padding: 24,
    overflow: 'hidden',
  },
  modalGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 12,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
  },
  modalMessage: {
    color: '#a0a0a5',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 24,
  },
  modalButtonRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
  modalCancelBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalCancelBtnText: {
    color: '#a0a0a5',
    fontSize: 14,
    fontWeight: '700',
  },
  modalConfirmBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalConfirmBtnDestructive: {
    backgroundColor: 'rgba(255, 74, 125, 0.25)',
  },
  modalConfirmBtnPrimary: {
    backgroundColor: theme.colors.accent,
  },
  modalConfirmBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  modalOkBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOkBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
